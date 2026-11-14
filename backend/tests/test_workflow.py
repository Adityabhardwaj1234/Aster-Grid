from __future__ import annotations

import time
from typing import Any

import pytest

from astergrid.presets import PRESETS
from astergrid.workflow import RunContext, run_workflow


async def run_preset(preset, *, max_revisions: int = 2) -> tuple[RunContext, list[dict[str, Any]]]:
    events: list[dict[str, Any]] = []
    artifacts: dict[str, Any] = {}

    async def emit(event_type: str, **kwargs: Any) -> None:
        events.append(
            {
                "at": time.perf_counter(),
                "type": event_type,
                **kwargs,
            }
        )

    async def artifact_sink(kind: str, artifact: Any) -> None:
        artifacts[kind] = artifact

    async def report_sink(report: Any) -> None:
        artifacts["report"] = report

    ctx = RunContext(
        run_id=f"run_test_{preset.id}",
        scenario=preset.scenario,
        max_revisions=max_revisions,
        emit_callback=emit,
        artifact_sink=artifact_sink,
        report_sink=report_sink,
    )
    await run_workflow(ctx)
    assert artifacts.keys() >= {"intake", "world", "conditions", "proposal", "access", "preflight"}
    return ctx, events


async def test_default_workflow_is_genuinely_parallel_and_verified() -> None:
    ctx, events = await run_preset(PRESETS[0])

    branch_ids = {"conditions", "resources", "access"}
    starts = [
        index
        for index, event in enumerate(events)
        if event["type"] == "agent.started" and event.get("agent_id") in branch_ids
    ]
    completions = [
        index
        for index, event in enumerate(events)
        if event["type"] == "agent.completed" and event.get("agent_id") in branch_ids
    ]
    assert len(starts) == 3
    assert len(completions) == 3
    assert max(starts) < min(completions), [
        e["type"] + ":" + str(e.get("agent_id")) for e in events
    ]

    joined = next(i for i, e in enumerate(events) if e["type"] == "join.completed")
    assert joined > max(completions)
    assert any(e["type"] == "revision.started" for e in events)
    assert any(e["type"] == "run.committed" for e in events)
    assert ctx.committed is True
    assert ctx.needs_attention is False
    assert ctx.report is not None
    assert ctx.preflight is not None and ctx.preflight.passed is True
    assert ctx.outcome is not None and ctx.outcome.passed is True
    assert ctx.report.metrics.coverage_pct == 100.0
    assert ctx.report.metrics.unmet_demand == 0
    assert ctx.report.findings, "resolved findings should remain in the audit report"
    assert any(f.code == "ROUTE_BLOCKED" for f in ctx.report.findings)
    assert len(ctx.revisions) >= 1
    assert ctx.report.result_hash == ctx.simulation.hash


@pytest.mark.parametrize("preset", PRESETS, ids=lambda preset: preset.id)
async def test_every_scenario_reaches_a_verified_commit(preset) -> None:
    ctx, events = await run_preset(preset)

    assert ctx.committed is True
    assert ctx.needs_attention is False
    assert ctx.report is not None
    assert ctx.preflight is not None and ctx.preflight.passed
    assert ctx.outcome is not None and ctx.outcome.passed
    assert ctx.proposal is not None
    assert ctx.proposal.unassigned == []
    assert all(a.status == "validated" for a in ctx.proposal.assignments)
    assert ctx.report.metrics.completed_tasks == ctx.report.metrics.total_tasks
    assert any(e["type"] == "run.committed" for e in events)


async def test_preview_hash_mismatch_blocks_commit() -> None:
    ctx = RunContext(
        run_id="run_test_mismatch",
        scenario=PRESETS[0].scenario,
        preview_world_hash="0" * 64,
    )
    with pytest.raises(RuntimeError, match="preview"):
        await run_workflow(ctx)
    assert ctx.committed is False
    assert ctx.world is None
