from __future__ import annotations

import asyncio
import logging
import secrets
import time
from collections import deque
from datetime import UTC, datetime
from typing import Any

from . import __version__
from .agents import AGENT_DEFINITIONS
from .config import Settings
from .events import EventBus
from .models import (
    RunManifest,
    RunRecord,
    ScenarioConfig,
)
from .report import ALGORITHM_VERSIONS
from .store import Store
from .workflow import RunContext, run_workflow

logger = logging.getLogger("astergrid.runner")

TERMINAL_STATUSES = {"completed", "needs_attention", "failed", "cancelled", "interrupted"}


class RunRejected(Exception):
    def __init__(self, code: str, message: str, status_code: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def _now() -> str:
    return datetime.now(UTC).isoformat()


class RunManager:
    def __init__(self, store: Store, settings: Settings) -> None:
        self.store = store
        self.settings = settings
        self.buses: dict[str, EventBus] = {}
        self.tasks: dict[str, asyncio.Task[None]] = {}
        self._rate_window: deque[float] = deque()
        self._rate_lock = asyncio.Lock()

    @property
    def gemini_configured(self) -> bool:
        import os

        return bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))

    async def _check_rate(self) -> None:
        async with self._rate_lock:
            now = time.monotonic()
            while self._rate_window and self._rate_window[0] < now - 60:
                self._rate_window.popleft()
            if len(self._rate_window) >= 6:
                raise RunRejected(
                    "RATE_LIMIT",
                    "At most 6 runs may be started per minute on this local instance.",
                    429,
                )
            self._rate_window.append(now)

    def _validate_scenario(self, scenario: ScenarioConfig) -> None:
        allowed = {f"D-{index}" for index in range(6)}
        unknown = sorted(set(scenario.affected_district_ids) - allowed)
        if unknown:
            raise RunRejected(
                "UNKNOWN_DISTRICT",
                f"Unknown district ids: {', '.join(unknown)}.",
            )
        if scenario.execution_mode == "gemini":
            if not self.gemini_configured:
                raise RunRejected(
                    "GEMINI_NOT_CONFIGURED",
                    "Gemini mode requires GEMINI_API_KEY or GOOGLE_API_KEY. "
                    "The deterministic rules mode is the tested acceptance path.",
                )
            raise RunRejected(
                "GEMINI_NOT_ENABLED",
                "Gemini execution is scaffolded but not enabled in this build. "
                "Run the deterministic rules mode; it uses real ADK orchestration "
                "with zero model calls.",
                501,
            )

    async def create_run(
        self, scenario: ScenarioConfig, *, preview_world_hash: str | None = None
    ) -> RunRecord:
        self._validate_scenario(scenario)
        await self._check_rate()
        run_id = f"run_{secrets.token_hex(6)}"
        timestamp = _now()
        record = RunRecord(
            id=run_id,
            status="queued",
            scenario=scenario,
            created_at=timestamp,
            updated_at=timestamp,
            effective_mode="deterministic",
        )
        await self.store.create_run(record)
        bus = EventBus(self.store, run_id, initial_seq=0)
        self.buses[run_id] = bus
        await bus.emit(
            "run.queued",
            agent_id="director",
            status="queued",
            payload={
                "scenario": scenario.name,
                "scenario_type": scenario.scenario_type,
                "requested_mode": scenario.execution_mode,
                "effective_mode": "deterministic",
            },
        )
        task = asyncio.create_task(
            self._execute(record, bus, preview_world_hash),
            name=f"astergrid:{run_id}",
        )
        self.tasks[run_id] = task

        def _done(finished: asyncio.Task[None]) -> None:
            self.tasks.pop(run_id, None)
            if finished.cancelled():
                return
            try:
                exc = finished.exception()
            except Exception:  # pragma: no cover - callback boundary
                return
            if exc is not None:
                logger.error("Unhandled run task failure for %s: %s", run_id, exc)

        task.add_done_callback(_done)
        return record

    async def _execute(
        self,
        record: RunRecord,
        bus: EventBus,
        preview_world_hash: str | None = None,
    ) -> None:
        run_id = record.id
        started_at = _now()
        started_perf = time.perf_counter()
        await self.store.update_run(run_id, status="running", current_agent="director")
        await bus.emit(
            "run.started",
            agent_id="director",
            status="active",
            payload={
                "started_at": started_at,
                "mode": "deterministic",
                "model_calls": 0,
                "agents": [a.id for a in AGENT_DEFINITIONS],
            },
        )

        async def emit(
            event_type: str,
            *,
            agent_id: str | None = None,
            status: str | None = None,
            payload: dict[str, Any] | None = None,
        ) -> None:
            await bus.emit(event_type, agent_id=agent_id, status=status, payload=payload)
            if event_type == "agent.started" and agent_id:
                await self.store.update_run(run_id, current_agent=agent_id)

        async def artifact_sink(kind: str, artifact: Any) -> None:
            await self.store.save_artifact(run_id, kind, artifact)

        async def report_sink(report: Any) -> None:
            await self.store.save_report(run_id, report, report.markdown)

        ctx = RunContext(
            run_id=run_id,
            scenario=record.scenario,
            max_revisions=self.settings.max_revisions,
            preview_world_hash=preview_world_hash,
            emit_callback=emit,
            artifact_sink=artifact_sink,
            report_sink=report_sink,
        )
        try:
            await asyncio.wait_for(run_workflow(ctx), timeout=self.settings.run_timeout_seconds)
            status = "needs_attention" if ctx.needs_attention else "completed"
            completed_at = _now()
            duration_ms = int((time.perf_counter() - started_perf) * 1000)
            report = ctx.report
            manifest = RunManifest(
                run_id=run_id,
                requested_mode=record.scenario.execution_mode,
                effective_mode="deterministic",
                model_calls=0,
                input_hash=record.scenario.input_hash,
                world_hash=ctx.world.hash if ctx.world else "",
                simulation_hash=ctx.simulation.hash if ctx.simulation else "",
                result_hash=report.result_hash if report else "",
                revisions=ctx.revision,
                algorithm_versions=ALGORITHM_VERSIONS,
                started_at=started_at,
                completed_at=completed_at,
                duration_ms=duration_ms,
                status=status,
            )
            await self.store.save_artifact(run_id, "manifest", manifest)
            await self.store.update_run(
                run_id,
                status=status,
                current_agent=None,
                revision_count=ctx.revision,
                model_calls=0,
                world_hash=manifest.world_hash,
                result_hash=manifest.result_hash,
                manifest=manifest,
                has_report=report is not None,
                error=None,
            )
            event_type = "run.completed" if status == "completed" else "run.needs_attention"
            await bus.emit(
                event_type,
                agent_id="director",
                status=status,
                payload={
                    "status": status,
                    "result_hash": manifest.result_hash,
                    "report_id": report.id if report else "",
                    "revisions": ctx.revision,
                    "duration_ms": duration_ms,
                    "metrics": report.metrics.model_dump(mode="json") if report else {},
                    "model_calls": 0,
                },
            )
        except asyncio.CancelledError:
            await self.store.update_run(
                run_id,
                status="cancelled",
                current_agent=None,
                error="Run cancelled by user.",
            )
            await bus.emit(
                "run.cancelled",
                agent_id="director",
                status="cancelled",
                payload={"message": "Run cancelled by user."},
            )
            raise
        except TimeoutError:
            message = f"Run exceeded the {self.settings.run_timeout_seconds:.0f}s execution budget."
            logger.warning("Run %s timed out", run_id)
            await self.store.update_run(run_id, status="failed", current_agent=None, error=message)
            await bus.emit(
                "run.failed",
                agent_id="director",
                status="failed",
                payload={"code": "RUN_TIMEOUT", "message": message},
            )
        except Exception as exc:  # noqa: BLE001 - boundary must report every failure honestly
            logger.exception("Run %s failed", run_id)
            message = f"{type(exc).__name__}: {exc}"
            if len(message) > 600:
                message = message[:597] + "..."
            await self.store.update_run(run_id, status="failed", current_agent=None, error=message)
            await bus.emit(
                "run.failed",
                agent_id="director",
                status="failed",
                payload={
                    "code": "RUN_FAILED",
                    "message": message,
                    "version": __version__,
                },
            )
        finally:
            await bus.close()
            if self.tasks.get(run_id) is asyncio.current_task():
                self.tasks.pop(run_id, None)
            try:
                await self.store.prune(self.settings.runs_retention)
            except Exception:  # pragma: no cover - maintenance must not mask run outcome
                logger.exception("Run retention prune failed")

    async def cancel(self, run_id: str) -> RunRecord | None:
        record = await self.store.get_run(run_id)
        if record is None:
            return None
        task = self.tasks.get(run_id)
        if task is not None and not task.done() and record.status not in TERMINAL_STATUSES:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception:  # noqa: BLE001 - cancellation is best-effort
                logger.exception("Run %s failed while cancelling", run_id)

        current = await self.store.get_run(run_id)
        if current is not None and current.status not in TERMINAL_STATUSES:
            # A task can be cancelled before it enters its own handler. Make the
            # terminal state visible rather than leaving a permanently "queued"
            # record behind.
            message = "Run cancelled by user."
            await self.store.update_run(
                run_id,
                status="cancelled",
                current_agent=None,
                error=message,
            )
            bus = self.buses.get(run_id)
            if bus is not None and not bus.closed:
                await bus.emit(
                    "run.cancelled",
                    agent_id="director",
                    status="cancelled",
                    payload={"message": message},
                )
        return await self.store.get_run(run_id)

    def get_bus(self, run_id: str) -> EventBus | None:
        return self.buses.get(run_id)

    async def shutdown(self) -> None:
        for task in list(self.tasks.values()):
            task.cancel()
        if self.tasks:
            await asyncio.gather(*self.tasks.values(), return_exceptions=True)
        for bus in list(self.buses.values()):
            await bus.close()

    @property
    def active_count(self) -> int:
        return sum(1 for task in self.tasks.values() if not task.done())
