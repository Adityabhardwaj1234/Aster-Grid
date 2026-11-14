from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import __version__
from .agents import AGENT_DEFINITIONS
from .config import Settings
from .config import settings as default_settings
from .manager import RunManager, RunRejected
from .models import (
    ErrorResponse,
    HealthResponse,
    MetaResponse,
    PresetInfo,
    PreviewResponse,
    RunCreated,
    RunEvent,
    RunRecord,
    ScenarioConfig,
)
from .presets import PRESETS
from .report import ALGORITHM_VERSIONS, DISCLAIMER
from .store import Store
from .worldgen import generate_world

TERMINAL_EVENT_TYPES = {
    "run.completed",
    "run.needs_attention",
    "run.failed",
    "run.cancelled",
}

MAX_API_BODY_BYTES = 256_000


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str, details: list[str] | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or []


def _error(
    status_code: int, code: str, message: str, details: list[str] | None = None
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=ErrorResponse(code=code, message=message, details=details or []).model_dump(
            mode="json"
        ),
    )


def sse_frame(event: RunEvent) -> str:
    return f"id: {event.seq}\ndata: {event.model_dump_json()}\n\n"


def create_app(config: Settings | None = None) -> FastAPI:
    app_settings = config or default_settings

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        store = Store(app_settings.database_path)
        await store.connect()
        await store.mark_orphaned()
        await store.prune(app_settings.runs_retention)
        manager = RunManager(store, app_settings)
        app.state.store = store
        app.state.manager = manager
        app.state.settings = app_settings
        try:
            yield
        finally:
            await manager.shutdown()
            await store.close()

    app = FastAPI(
        title="ASTERGRID",
        version=__version__,
        description=(
            "Synthetic 3D emergency-response command lab with real Google ADK "
            "orchestration and deterministic verification."
        ),
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=app_settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = None
        content_length = request.headers.get("content-length")
        if (
            content_length is not None
            and request.url.path.startswith("/api/")
            and request.method in {"POST", "PUT", "PATCH", "DELETE"}
        ):
            try:
                length = int(content_length)
            except ValueError:
                response = _error(
                    400, "INVALID_CONTENT_LENGTH", "Content-Length must be an integer."
                )
            else:
                if length > MAX_API_BODY_BYTES:
                    response = _error(
                        413,
                        "PAYLOAD_TOO_LARGE",
                        f"Request bodies are limited to {MAX_API_BODY_BYTES} bytes.",
                    )
        if response is None:
            response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        )
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        if not request.url.path.startswith(("/docs", "/redoc", "/openapi.json")):
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: blob:; "
                "font-src 'self'; "
                "connect-src 'self'; "
                "worker-src 'self' blob:; "
                "object-src 'none'; "
                "base-uri 'self'; "
                "form-action 'self'; "
                "frame-ancestors 'none'"
            )
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(ApiError)
    async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
        return _error(exc.status_code, exc.code, exc.message, exc.details)

    @app.exception_handler(RunRejected)
    async def rejected_handler(_: Request, exc: RunRejected) -> JSONResponse:
        return _error(exc.status_code, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = []
        for error in exc.errors():
            location = ".".join(str(part) for part in error.get("loc", []))
            details.append(f"{location}: {error.get('msg', 'invalid value')}")
        return _error(422, "VALIDATION_ERROR", "The request did not pass validation.", details)

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR"
        return _error(exc.status_code, code, str(exc.detail))

    @app.get("/api/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        store: Store = app.state.store
        ok = await store.health()
        if not ok:
            raise ApiError(503, "DATABASE_UNAVAILABLE", "The local catalog is unavailable.")
        return HealthResponse(status="ok", version=__version__, database="ok")

    @app.get("/api/meta", response_model=MetaResponse)
    async def meta() -> MetaResponse:
        manager: RunManager = app.state.manager
        return MetaResponse(
            product="ASTERGRID",
            version=__version__,
            execution_mode="deterministic",
            gemini_configured=manager.gemini_configured,
            max_revisions=app_settings.max_revisions,
            scenario_types=["flood", "wildfire", "infrastructure", "exploration"],
            world_presets=[preset.id for preset in PRESETS],
            algorithm_versions=ALGORITHM_VERSIONS,
            disclaimer=DISCLAIMER,
        )

    @app.get("/api/presets", response_model=list[PresetInfo])
    async def presets() -> list[PresetInfo]:
        return PRESETS

    @app.get("/api/agents")
    async def agents() -> list[dict]:
        return [agent.model_dump(mode="json") for agent in AGENT_DEFINITIONS]

    @app.post("/api/preview", response_model=PreviewResponse)
    async def preview(scenario: ScenarioConfig) -> PreviewResponse:
        allowed = {f"D-{index}" for index in range(6)}
        unknown = sorted(set(scenario.affected_district_ids) - allowed)
        if unknown:
            raise ApiError(
                422,
                "UNKNOWN_DISTRICT",
                f"Unknown district ids: {', '.join(unknown)}.",
            )
        world = generate_world(scenario)
        return PreviewResponse(
            world=world,
            draft=True,
            generator_version=world.algorithm_version,
            input_hash=scenario.input_hash,
        )

    @app.post("/api/runs", response_model=RunCreated, status_code=201)
    async def create_run(
        scenario: ScenarioConfig,
        preview_world_hash: str | None = Query(default=None),
    ) -> RunCreated:
        manager: RunManager = app.state.manager
        record = await manager.create_run(scenario, preview_world_hash=preview_world_hash)
        return RunCreated(
            run_id=record.id,
            status=record.status,
            stream_url=f"/api/runs/{record.id}/stream",
        )

    @app.get("/api/runs", response_model=list[RunRecord])
    async def list_runs(limit: int = Query(default=20, ge=1, le=50)) -> list[RunRecord]:
        store: Store = app.state.store
        return await store.list_runs(limit)

    @app.get("/api/runs/{run_id}", response_model=RunRecord)
    async def get_run(run_id: str) -> RunRecord:
        store: Store = app.state.store
        record = await store.get_run(run_id)
        if record is None:
            raise ApiError(404, "RUN_NOT_FOUND", f"Run {run_id} does not exist.")
        return record

    @app.get("/api/runs/{run_id}/bundle")
    async def get_bundle(run_id: str) -> dict:
        store: Store = app.state.store
        record = await store.get_run(run_id)
        if record is None:
            raise ApiError(404, "RUN_NOT_FOUND", f"Run {run_id} does not exist.")
        artifacts = await store.get_artifacts(run_id)
        report_bundle = await store.get_report(run_id)
        return {
            "run": record.model_dump(mode="json"),
            "artifacts": artifacts,
            "report": report_bundle["report"] if report_bundle else artifacts.get("report"),
            "report_markdown": report_bundle["markdown"] if report_bundle else "",
        }

    @app.get("/api/runs/{run_id}/events")
    async def get_events(
        run_id: str,
        after: int = Query(default=0, ge=0),
        limit: int = Query(default=1000, ge=1, le=5000),
    ) -> list[RunEvent]:
        store: Store = app.state.store
        if await store.get_run(run_id) is None:
            raise ApiError(404, "RUN_NOT_FOUND", f"Run {run_id} does not exist.")
        return await store.get_events(run_id, after_seq=after, limit=limit)

    @app.get("/api/runs/{run_id}/stream")
    async def stream(run_id: str, after: int = Query(default=0, ge=0)) -> StreamingResponse:
        store: Store = app.state.store
        manager: RunManager = app.state.manager
        record = await store.get_run(run_id)
        if record is None:
            raise ApiError(404, "RUN_NOT_FOUND", f"Run {run_id} does not exist.")
        bus = manager.get_bus(run_id)

        async def event_generator():
            queue = bus.subscribe() if bus is not None else None
            last_seq = after
            try:
                # Subscribe before replaying so events emitted in between are
                # captured, then deduplicate by sequence number.
                fetched = await store.get_events(run_id, after_seq=last_seq, limit=5000)
                for event in fetched:
                    last_seq = max(last_seq, event.seq)
                    yield sse_frame(event)
                if queue is not None:
                    while not queue.empty():
                        item = queue.get_nowait()
                        if item is None:
                            break
                        if item.seq > last_seq:
                            last_seq = item.seq
                            yield sse_frame(item)
                terminal_seen = any(event.type in TERMINAL_EVENT_TYPES for event in fetched)
                if terminal_seen or record.status in {
                    "completed",
                    "needs_attention",
                    "failed",
                    "cancelled",
                    "interrupted",
                }:
                    return
                while True:
                    if queue is None:
                        yield ": no live event bus; replay complete\n\n"
                        return
                    try:
                        item = await asyncio.wait_for(queue.get(), timeout=15.0)
                    except TimeoutError:
                        yield ": keep-alive\n\n"
                        current = await store.get_run(run_id)
                        if current is not None and current.status in {
                            "completed",
                            "needs_attention",
                            "failed",
                            "cancelled",
                            "interrupted",
                        }:
                            remaining = await store.get_events(
                                run_id, after_seq=last_seq, limit=5000
                            )
                            for event in remaining:
                                last_seq = max(last_seq, event.seq)
                                yield sse_frame(event)
                            return
                        continue
                    if item is None:
                        remaining = await store.get_events(run_id, after_seq=last_seq, limit=5000)
                        for event in remaining:
                            last_seq = max(last_seq, event.seq)
                            yield sse_frame(event)
                        return
                    if item.seq <= last_seq:
                        continue
                    last_seq = item.seq
                    yield sse_frame(item)
                    if item.type in TERMINAL_EVENT_TYPES:
                        remaining = await store.get_events(run_id, after_seq=last_seq, limit=5000)
                        for event in remaining:
                            last_seq = max(last_seq, event.seq)
                            yield sse_frame(event)
                        return
            finally:
                if queue is not None and bus is not None:
                    bus.unsubscribe(queue)

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    @app.get("/api/runs/{run_id}/report")
    async def get_report(run_id: str) -> dict:
        store: Store = app.state.store
        if await store.get_run(run_id) is None:
            raise ApiError(404, "RUN_NOT_FOUND", f"Run {run_id} does not exist.")
        bundle = await store.get_report(run_id)
        if bundle is None:
            raise ApiError(409, "REPORT_NOT_READY", "The report is not available for this run yet.")
        return bundle

    @app.get("/api/runs/{run_id}/report.md", response_class=PlainTextResponse)
    async def get_report_markdown(run_id: str) -> PlainTextResponse:
        store: Store = app.state.store
        if await store.get_run(run_id) is None:
            raise ApiError(404, "RUN_NOT_FOUND", f"Run {run_id} does not exist.")
        bundle = await store.get_report(run_id)
        if bundle is None:
            raise ApiError(409, "REPORT_NOT_READY", "The report is not available for this run yet.")
        return PlainTextResponse(
            bundle["markdown"],
            headers={"Content-Disposition": f'attachment; filename="{run_id}-report.md"'},
        )

    @app.post("/api/runs/{run_id}/cancel", response_model=RunRecord)
    async def cancel_run(run_id: str) -> RunRecord:
        manager: RunManager = app.state.manager
        record = await manager.cancel(run_id)
        if record is None:
            raise ApiError(404, "RUN_NOT_FOUND", f"Run {run_id} does not exist.")
        return record

    frontend_dir = app_settings.resolved_frontend_dir
    if frontend_dir.is_dir() and (frontend_dir / "index.html").is_file():
        assets_dir = frontend_dir / "assets"
        if assets_dir.is_dir():
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        async def spa(path: str) -> FileResponse:
            if path.startswith("api/"):
                raise HTTPException(status_code=404, detail="API route not found")
            root = frontend_dir.resolve()
            candidate = (frontend_dir / path).resolve()
            if candidate.is_file() and (root == candidate or root in candidate.parents):
                return FileResponse(candidate)
            return FileResponse(frontend_dir / "index.html")
    else:

        @app.get("/", include_in_schema=False)
        async def root() -> dict:
            return {
                "product": "ASTERGRID",
                "version": __version__,
                "message": "Backend is running. Build the frontend or use the Vite dev server.",
                "docs": "/docs",
            }

    return app


app = create_app()
