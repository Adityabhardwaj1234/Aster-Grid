from __future__ import annotations

from datetime import UTC, datetime

import pytest

from astergrid.models import RunEvent, RunRecord
from astergrid.presets import PRESETS
from astergrid.store import Store
from astergrid.worldgen import generate_world


def now() -> str:
    return datetime.now(UTC).isoformat()


@pytest.fixture
async def store(tmp_path):
    instance = Store(tmp_path / "catalog.db")
    await instance.connect()
    yield instance
    await instance.close()


async def test_store_persists_runs_events_artifacts_and_orphans(store: Store) -> None:
    scenario = PRESETS[0].scenario
    record = RunRecord(
        id="run_store_test",
        status="queued",
        scenario=scenario,
        created_at=now(),
        updated_at=now(),
        effective_mode="deterministic",
    )
    await store.create_run(record)
    await store.update_run("run_store_test", status="running", current_agent="world")
    event = RunEvent(
        event_id="run_store_test:1",
        run_id="run_store_test",
        seq=1,
        type="run.started",
        ts=now(),
        agent_id="director",
        status="active",
        payload={"mode": "deterministic"},
    )
    await store.append_event(event)

    fetched = await store.get_run("run_store_test")
    assert fetched is not None
    assert fetched.status == "running"
    assert fetched.current_agent == "world"
    assert len(await store.get_events("run_store_test")) == 1

    interrupted = await store.mark_orphaned()
    assert interrupted == ["run_store_test"]
    fetched = await store.get_run("run_store_test")
    assert fetched is not None
    assert fetched.status == "interrupted"
    assert fetched.error == "Server restarted before this run completed."
    events = await store.get_events("run_store_test")
    assert events[-1].type == "run.failed"
    assert events[-1].payload["code"] == "SERVER_RESTART"

    world = generate_world(scenario)
    await store.save_artifact("run_store_test", "world", world)
    stored_world = await store.get_artifact("run_store_test", "world")
    assert stored_world is not None
    assert stored_world["hash"] == world.hash
    assert "districts" in stored_world
