from __future__ import annotations

from datetime import UTC, datetime

from .models import (
    AccessReport,
    AgentSummary,
    AllocationProposal,
    ConditionsReport,
    FinalReport,
    Finding,
    ReportMetrics,
    RevisionRecord,
    ScenarioConfig,
    SimulationResult,
    VerificationReport,
    World,
)
from .presets import PRESETS

DISCLAIMER = (
    "Synthetic, fictional geography and populations. This is an educational simulation "
    "and must not be used for real emergency response, dispatch, surveillance, targeting, "
    "or operational planning."
)

ALGORITHM_VERSIONS = {
    "worldgen": "1.0",
    "routing": "1.0",
    "allocator": "1.0",
    "simulation": "1.0",
    "verifier": "1.0",
    "report": "1.0",
}


def _pct(value: float) -> str:
    return f"{value:.1f}%"


def build_markdown(report: FinalReport) -> str:
    metric_rows = [
        ("Objective score", f"{report.metrics.objective_score:.1f}/100"),
        ("Coverage", _pct(report.metrics.coverage_pct)),
        ("Delivery", _pct(report.metrics.delivery_pct)),
        ("Survey", _pct(report.metrics.survey_pct)),
        ("Median response", f"{report.metrics.median_response_min:.1f} min"),
        ("Utilization", _pct(report.metrics.utilization_pct)),
        ("Tasks completed", f"{report.metrics.completed_tasks}/{report.metrics.total_tasks}"),
        ("Unmet demand cohorts", str(report.metrics.unmet_demand)),
    ]
    assignment_rows = []
    for assignment in report.assignments:
        assignment_rows.append(
            f"| {assignment.id} | {assignment.asset_id} | {assignment.demand_id} | T+{assignment.start_min:.0f} | T+{assignment.end_min:.0f} | {assignment.load:g} | {assignment.status} |"
        )
    if not assignment_rows:
        assignment_rows.append("| — | — | — | — | — | — | no assignments |")
    finding_rows = [
        f"| {f.severity.upper()} | `{f.code}` | {f.message} | {', '.join(f.entity_ids)} |"
        for f in report.findings
    ] or ["| — | — | No findings | — |"]
    revision_rows = [
        f"| {r.attempt} | {r.trigger_stage} | {', '.join(r.trigger_codes)} | {r.assignments_changed} | {r.demands_deferred} |"
        for r in report.revisions
    ] or ["| — | — | — | — | — |"]
    unassigned_rows = [
        f"| {u.demand_id} | {u.priority} | {u.reason} |" for u in report.unassigned
    ] or ["| — | — | No unassigned demands |"]
    narrative = "\n".join(f"- {line}" for line in report.narrative)
    assumptions = "\n".join(f"- {line}" for line in report.assumptions)
    agents = "\n".join(
        f"| {agent.id} | {agent.name} | {agent.mode} | {agent.status} | {agent.duration_ms} ms | {agent.calls} |"
        for agent in report.agents
    )
    return (
        f"""# ASTERGRID Run Report — {report.title}

**Run:** `{report.run_id}`  
**Generated:** {report.generated_at}  
**Execution mode:** `{report.effective_mode.upper()}` · **Model calls:** {report.model_calls}  
**Result hash:** `{report.result_hash}`  
**World hash:** `{report.world_hash}`

> {report.disclaimer}

## Scenario

| Field | Value |
|---|---|
| Scenario | {report.scenario.name} |
| Type | {report.scenario.scenario_type} |
| Preset | {report.scenario.world_preset} |
| Seed | {report.scenario.seed} |
| Duration | {report.scenario.duration_minutes} min |
| Start | {report.scenario.start_hour:02d}:00 |
| Disruption | {report.scenario.disruption_level:.2f} |
| Rainfall | {report.scenario.weather.rainfall_mm_h:.0f} mm/h |
| Wind | {report.scenario.weather.wind_kph:.0f} km/h |

## Outcome

| Metric | Value |
|---|---|
"""
        + "\n".join(f"| {name} | {value} |" for name, value in metric_rows)
        + f"""

## Narrative

{narrative}

## Assignments

| Assignment | Asset | Demand | Start | End | Load | State |
|---|---|---|---|---|---:|---|
"""
        + "\n".join(assignment_rows)
        + """

## Unassigned demands

| Demand | Priority | Reason |
|---|---|---|
"""
        + "\n".join(unassigned_rows)
        + """

## Findings

| Severity | Code | Message | Entities |
|---|---|---|---|
"""
        + "\n".join(finding_rows)
        + """

## Revision history

| Attempt | Trigger | Codes | Assignments changed | Deferred |
|---|---|---|---|---|
"""
        + "\n".join(revision_rows)
        + """

## Agent execution

| Agent | Role | Mode | Status | Duration | Calls |
|---|---|---|---|---|---:|
"""
        + agents
        + f"""

## Assumptions

{assumptions}

## Provenance

- Algorithm versions: `{report.algorithm_versions}`
- Input hash: `{report.input_hash}`
- Simulation hash: `{report.simulation_hash}`
- Evidence events are available through the run stream and event store.
- Re-running the same scenario seed and algorithm versions must reproduce the result hash.

---

*{DISCLAIMER}*
"""
    )


def build_report(
    *,
    run_id: str,
    scenario: ScenarioConfig,
    world: World,
    proposal: AllocationProposal,
    conditions: ConditionsReport,
    access: AccessReport,
    preflight: VerificationReport,
    outcome: VerificationReport,
    simulation: SimulationResult,
    revisions: list[RevisionRecord],
    agents: list[AgentSummary],
    findings: list[Finding] | None = None,
    model_calls: int = 0,
) -> FinalReport:
    preset = next((p for p in PRESETS if p.id == scenario.world_preset), PRESETS[0])
    finding_history = (
        list(findings) if findings is not None else [*preflight.findings, *outcome.findings]
    )
    blocking_findings = sum(1 for f in finding_history if f.severity == "error")
    metrics = ReportMetrics(
        coverage_pct=simulation.metrics.coverage_pct,
        delivery_pct=simulation.metrics.delivery_pct,
        survey_pct=simulation.metrics.survey_pct,
        median_response_min=simulation.metrics.median_response_min,
        utilization_pct=simulation.metrics.utilization_pct,
        objective_score=simulation.metrics.objective_score,
        completed_tasks=simulation.metrics.completed_tasks,
        total_tasks=simulation.metrics.total_tasks,
        unmet_demand=simulation.metrics.unmet_demand,
    )
    narrative = [
        f"Verification recorded {blocking_findings} blocking finding(s) across the run; "
        f"the final preflight checked {preflight.checked_count} conditions.",
        f"{len(revisions)} bounded revision pass(es) were applied before the final simulation.",
        f"The simulated result completes {simulation.metrics.completed_tasks} of "
        f"{simulation.metrics.total_tasks} demand cohorts with an objective score of "
        f"{simulation.metrics.objective_score:.1f}.",
        (
            "The plan was validated against projected closures, not merely against the current map."
            if access.closed_edge_ids
            else "No projected closures affected this plan."
        ),
        (
            "The run is deterministic and reproduces from the recorded seed and algorithm versions."
            if not model_calls
            else "This run used live model calls; deterministic domain results still come from software."
        ),
    ]
    assumptions = list(
        dict.fromkeys(
            [
                *proposal.assumptions,
                *conditions.assumptions,
                *access.assumptions,
                "All geography, people, facilities, and hazards are fictional and generated locally.",
            ]
        )
    )
    report = FinalReport(
        id=f"RPT-{run_id.split('_')[-1]}",
        run_id=run_id,
        title=f"{preset.name} · {scenario.name}",
        generated_at=datetime.now(UTC).isoformat(),
        scenario=scenario,
        execution_mode=scenario.execution_mode,
        effective_mode="deterministic" if model_calls == 0 else scenario.execution_mode,
        model_calls=model_calls,
        world_hash=world.hash,
        input_hash=scenario.input_hash,
        result_hash=simulation.hash,
        simulation_hash=simulation.hash,
        metrics=metrics,
        assignments=proposal.assignments,
        unassigned=proposal.unassigned,
        findings=finding_history,
        revisions=revisions,
        agents=agents,
        assumptions=assumptions,
        narrative=narrative,
        algorithm_versions=ALGORITHM_VERSIONS,
        disclaimer=DISCLAIMER,
    )
    report.markdown = build_markdown(report)
    return report
