from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from astergrid import manager as manager_module
from astergrid.config import Settings
from astergrid.main import create_app
from astergrid.manager import RunManager
from astergrid.models import RunEvent, RunRecord
from astergrid.presets import PRESETS
from astergrid.store import Store


def now() -> str:
    return datetime.now(UTC).isoformat()


@pytest.fixture
async def store(tmp_path) -> AsyncIterator[Store]:
    instance = Store(tmp_path / "lifecycle.db")
    await instance.connect()
    yield instance
    await instance.close()


def make_settings(tmp_path, **overrides: Any) -> Settings:
    return Settings(
        data_dir=tmp_path,
        frontend_dir=tmp_path / "missing-frontend",
        run_timeout_seconds=overrides.pop("run_timeout_seconds", 30),
        cors_origins="http://testserver",
        **overrides,
    )


async def test_cancel_returns_an_honest_terminal_state(store: Store, tmp_path, monkeypatch) -> None:
    async def blocked_workflow(_context: Any) -> None:
        await asyncio.sleep(60)

    monkeypatch.setattr(manager_module, "run_workflow", blocked_workflow)
    manager = RunManager(store, make_settings(tmp_path))
    record = await manager.create_run(PRESETS[0].scenario)

    for _ in range(100):
        current = await store.get_run(record.id)
        if current is not None and current.status == "running":
            break
        await asyncio.sleep(0.01)

    cancelled = await manager.cancel(record.id)
    assert cancelled is not None
    assert cancelled.status == "cancelled"
    assert cancelled.error == "Run cancelled by user."

    events = await store.get_events(record.id)
    assert events[-1].type == "run.cancelled"
    assert events[-1].status == "cancelled"
    assert events[-1].payload == {"message": "Run cancelled by user."}
    await manager.shutdown()


async def test_timeout_is_persisted_and_emits_a_timeout_event(
    store: Store, tmp_path, monkeypatch
) -> None:
    async def slow_workflow(_context: Any) -> None:
        await asyncio.sleep(30)

    monkeypatch.setattr(manager_module, "run_workflow", slow_workflow)
    settings = make_settings(tmp_path, run_timeout_seconds=0.02)
    manager = RunManager(store, settings)
    record = await manager.create_run(PRESETS[0].scenario)
    task = manager.tasks[record.id]
    await task

    timed_out = await store.get_run(record.id)
    assert timed_out is not None
    assert timed_out.status == "failed"
    assert timed_out.error is not None
    assert "execution budget" in timed_out.error
    events = await store.get_events(record.id)
    assert events[-1].type == "run.failed"
    assert events[-1].payload["code"] == "RUN_TIMEOUT"
    await manager.shutdown()


async def test_orphaned_run_is_marked_interrupted_through_the_api(tmp_path) -> None:
    settings = make_settings(tmp_path)
    seeded = Store(settings.database_path)
    await seeded.connect()
    try:
        record = RunRecord(
            id="run_restart_orphan",
            status="running",
            scenario=PRESETS[0].scenario,
            created_at=now(),
            updated_at=now(),
            effective_mode="deterministic",
            current_agent="simulation",
        )
        await seeded.create_run(record)
        await seeded.append_event(
            RunEvent(
                event_id="run_restart_orphan:1",
                run_id=record.id,
                seq=1,
                type="run.started",
                ts=now(),
                agent_id="director",
                status="active",
                payload={"mode": "deterministic"},
            )
        )
    finally:
        await seeded.close()

    app = create_app(settings)
    with TestClient(app) as client:
        response = client.get("/api/runs/run_restart_orphan")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "interrupted"
        assert body["error"] == "Server restarted before this run completed."

        events = client.get("/api/runs/run_restart_orphan/events").json()
        assert events[-1]["type"] == "run.failed"
        assert events[-1]["payload"]["code"] == "SERVER_RESTART"
