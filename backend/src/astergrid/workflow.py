from __future__ import annotations

import asyncio
import inspect
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from google.adk import Event, Workflow
from google.adk.runners import InMemoryRunner
from google.adk.workflow import FunctionNode, JoinNode
from google.genai import types

from .access import build_access_report
from .agents import AGENT_BY_ID, AGENT_ORDER
from .allocation import assignment_delta, first_pass, repair_pass
from .hazards import conditions_summary, planning_horizon_min
from .models import (
    AccessReport,
    AgentSummary,
    AllocationProposal,
    ConditionsReport,
    FinalReport,
    Finding,
    IntakeArtifact,
    RevisionRecord,
    ScenarioConfig,
    SimulationResult,
    VerificationReport,
    World,
)
from .report import build_markdown, build_report
from .simulation import simulate
from .verification import verify_outcome, verify_preflight
from .worldgen import generate_world

AGENT_NAMES = {agent.id: agent.name for agent in AGENT_BY_ID.values()}


def _now() -> str:
    return datetime.now(UTC).isoformat()


@dataclass
class AgentRuntime:
    id: str
    name: str
    started_perf: float
    started_at: str
    status: str = "active"
    duration_ms: int = 0
    artifact_hash: str = ""
    calls: int = 0
    note: str = ""


def artifact_summary(kind: str, artifact: Any) -> dict:
    if kind == "world":
        return {
            "id": artifact.id,
            "hash": artifact.hash,
            "title": artifact.title,
            "districts": len(artifact.districts),
            "assets": len(artifact.assets),
            "demands": len(artifact.demands),
            "nodes": len(artifact.nodes),
            "edges": len(artifact.edges),
            "generator_version": artifact.algorithm_version,
        }
    if kind == "intake":
        return {
            "session_id": artifact.session_id,
            "accepted": artifact.accepted,
            "notes": artifact.notes,
        }
    if kind == "conditions":
        return {
            "summary": artifact.summary,
            "closed_edge_ids": artifact.closed_edge_ids,
            "planning_horizon_min": artifact.planning_horizon_min,
            "water_level_at_horizon_m": artifact.water_level_at_horizon_m,
            "fire_radius_at_horizon_km": artifact.fire_radius_at_horizon_km,
            "travel_factor": artifact.travel_factor,
        }
    if kind == "proposal":
        return {
            "id": artifact.id,
            "hash": artifact.hash,
            "revision": artifact.revision,
            "assignments": [
                {
                    "id": a.id,
                    "demand_id": a.demand_id,
                    "asset_id": a.asset_id,
                    "start_min": a.start_min,
                    "end_min": a.end_min,
                    "status": a.status,
                    "route_edge_ids": a.route_edge_ids,
                }
                for a in artifact.assignments
            ],
            "unassigned": [u.model_dump(mode="json") for u in artifact.unassigned],
        }
    if kind == "access":
        return {
            "hash": artifact.hash,
            "closed_edge_ids": artifact.closed_edge_ids,
            "unreachable_demand_ids": artifact.unreachable_demand_ids,
            "route_count": len(artifact.routes),
        }
    if kind in ("preflight", "outcome"):
        return {
            "id": artifact.id,
            "hash": artifact.hash,
            "stage": artifact.stage,
            "passed": artifact.passed,
            "summary": artifact.summary,
            "checked_count": artifact.checked_count,
            "findings": [f.model_dump(mode="json") for f in artifact.findings],
            "metrics": artifact.metrics,
        }
    if kind == "simulation":
        return {
            "id": artifact.id,
            "hash": artifact.hash,
            "revision": artifact.revision,
            "metrics": artifact.metrics.model_dump(mode="json"),
            "events": len(artifact.events),
            "snapshots": len(artifact.snapshots),
        }
    if kind == "report":
        return {
            "id": artifact.id,
            "result_hash": artifact.result_hash,
            "model_calls": artifact.model_calls,
            "metrics": artifact.metrics.model_dump(mode="json"),
            "markdown_length": len(artifact.markdown),
        }
    return {"hash": getattr(artifact, "hash", "")}


@dataclass
class RunContext:
    run_id: str
    scenario: ScenarioConfig
    max_revisions: int = 2
    preview_world_hash: str | None = None
    emit_callback: Callable[..., Awaitable[Any]] | None = None
    artifact_sink: Callable[[str, Any], Awaitable[None]] | None = None
    report_sink: Callable[[FinalReport], Awaitable[None]] | None = None
    artifacts: dict[str, Any] = field(default_factory=dict)
    intake: IntakeArtifact | None = None
    world: World | None = None
    conditions: ConditionsReport | None = None
    proposal: AllocationProposal | None = None
    access: AccessReport | None = None
    preflight: VerificationReport | None = None
    outcome: VerificationReport | None = None
    simulation: SimulationResult | None = None
    report: FinalReport | None = None
    revisions: list[RevisionRecord] = field(default_factory=list)
    finding_history: list[Finding] = field(default_factory=list)
    revision: int = 0
    needs_attention: bool = False
    committed: bool = False
    agent_runtime: dict[str, AgentRuntime] = field(default_factory=dict)

    async def emit(
        self,
        event_type: str,
        *,
        agent_id: str | None = None,
        status: str | None = None,
        payload: dict | None = None,
    ) -> None:
        if self.emit_callback is None:
            return
        await self.emit_callback(
            event_type, agent_id=agent_id, status=status, payload=payload or {}
        )
        # Cooperatively yield so genuinely parallel ADK branches can overlap
        # even when this particular event sink is a fast local writer.
        await asyncio.sleep(0)

    def remember_findings(self, report: VerificationReport) -> None:
        for finding in report.findings:
            self.finding_history.append(
                finding.model_copy(
                    update={
                        "id": f"{report.stage[:3].upper()}-{finding.id}",
                        "message": f"[{report.stage}] {finding.message}",
                    }
                )
            )

    async def begin_agent(self, agent_id: str, name: str | None = None) -> AgentRuntime:
        existing = self.agent_runtime.get(agent_id)
        runtime = AgentRuntime(
            id=agent_id,
            name=name or AGENT_NAMES.get(agent_id, agent_id),
            started_perf=time.perf_counter(),
            started_at=_now(),
        )
        if existing is not None:
            runtime.duration_ms = existing.duration_ms
            runtime.calls = existing.calls
            runtime.artifact_hash = existing.artifact_hash
        self.agent_runtime[agent_id] = runtime
        await self.emit(
            "agent.started",
            agent_id=agent_id,
            status="active",
            payload={
                "name": runtime.name,
                "started_at": runtime.started_at,
                "depends_on": AGENT_BY_ID.get(agent_id).depends_on
                if agent_id in AGENT_BY_ID
                else [],
            },
        )
        return runtime

    async def finish_agent(
        self,
        agent_id: str,
        *,
        status: str = "completed",
        artifact_hash: str = "",
        note: str = "",
    ) -> AgentRuntime:
        runtime = self.agent_runtime.get(agent_id)
        if runtime is None:
            runtime = await self.begin_agent(agent_id)
        elapsed = int((time.perf_counter() - runtime.started_perf) * 1000)
        runtime.duration_ms += elapsed
        runtime.calls += 1
        runtime.status = status
        runtime.note = note
        if artifact_hash:
            runtime.artifact_hash = artifact_hash
        await self.emit(
            "agent.completed",
            agent_id=agent_id,
            status=status,
            payload={
                "name": runtime.name,
                "started_at": runtime.started_at,
                "duration_ms": runtime.duration_ms,
                "artifact_hash": runtime.artifact_hash,
                "calls": runtime.calls,
                "note": note,
            },
        )
        return runtime

    async def run_agent(self, agent_id: str, name: str, work: Callable[[], Awaitable[Any]]) -> Any:
        await self.begin_agent(agent_id, name)
        try:
            result = await work()
        except Exception as exc:
            await self.finish_agent(agent_id, status="failed", note=str(exc))
            raise
        await self.finish_agent(
            agent_id, status="completed", artifact_hash=getattr(result, "hash", "")
        )
        return result

    async def save_artifact(self, kind: str, artifact: Any, *, agent_id: str) -> None:
        self.artifacts[kind] = artifact
        if self.artifact_sink is not None:
            await self.artifact_sink(kind, artifact)
        await self.emit(
            "artifact.created",
            agent_id=agent_id,
            status="created",
            payload={
                "kind": kind,
                "artifact_id": getattr(artifact, "id", kind),
                "hash": getattr(artifact, "hash", ""),
                "summary": artifact_summary(kind, artifact),
            },
        )
        await asyncio.sleep(0)

    async def save_report(self, report: FinalReport) -> None:
        self.report = report
        self.artifacts["report"] = report
        if self.report_sink is not None:
            await self.report_sink(report)

    def agent_summaries(self, *, exclude: set[str] | None = None) -> list[AgentSummary]:
        exclude = exclude or set()
        result: list[AgentSummary] = []
        for agent_id in AGENT_ORDER:
            if agent_id in exclude:
                continue
            runtime = self.agent_runtime.get(agent_id)
            if runtime is None:
                continue
            result.append(
                AgentSummary(
                    id=agent_id,
                    name=runtime.name,
                    mode="deterministic",
                    status=runtime.status
                    if runtime.status in ("completed", "failed", "needs_attention")
                    else "completed",
                    duration_ms=max(0, runtime.duration_ms),
                    artifact_hash=runtime.artifact_hash,
                    calls=runtime.calls,
                    note=runtime.note,
                )
            )
        return result


def _event_output(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value


def build_workflow(ctx: RunContext) -> Workflow:
    async def intake() -> Event:
        async def work() -> IntakeArtifact:
            artifact = IntakeArtifact(
                session_id=ctx.run_id,
                scenario=ctx.scenario,
                accepted=True,
                notes=[
                    "Synthetic scenario validated at the boundary.",
                    "Deterministic policy mode: no model calls are made.",
                    f"World preview hash: {ctx.preview_world_hash or 'not supplied'}",
                ],
                warnings=[],
            )
            ctx.intake = artifact
            await ctx.save_artifact("intake", artifact, agent_id="intake")
            return artifact

        artifact = await ctx.run_agent("intake", "Intake", work)
        return Event(output=_event_output(artifact))

    async def world() -> Event:
        async def work() -> World:
            built = generate_world(ctx.scenario)
            if ctx.preview_world_hash and built.hash != ctx.preview_world_hash:
                raise RuntimeError(
                    "World Builder output does not match the draft preview hash. "
                    "The scenario changed after preview; preview and commit must match."
                )
            ctx.world = built
            await ctx.save_artifact("world", built, agent_id="world")
            return built

        built = await ctx.run_agent("world", "World Builder", work)
        return Event(output={"world_hash": built.hash, "world_id": built.id})

    async def conditions() -> Event:
        async def work() -> ConditionsReport:
            assert ctx.world is not None
            travel, visibility, water, fire, closed, notes = conditions_summary(
                ctx.world, ctx.scenario
            )
            artifact = ConditionsReport(
                summary=(
                    f"{ctx.scenario.scenario_type.title()} projections at T+"
                    f"{planning_horizon_min(ctx.scenario)}; "
                    f"{len(closed)} projected closure(s)."
                ),
                assumptions=[
                    "Weather is synthetic and fixed by the scenario seed.",
                    *notes,
                ],
                travel_factor=travel,
                visibility_factor=visibility,
                planning_horizon_min=planning_horizon_min(ctx.scenario),
                water_level_at_horizon_m=water,
                fire_radius_at_horizon_km=fire,
                closed_edge_ids=closed,
                risk_notes=notes,
                mode="deterministic",
            )
            ctx.conditions = artifact
            await ctx.save_artifact("conditions", artifact, agent_id="conditions")
            return artifact

        artifact = await ctx.run_agent("conditions", "Conditions Analyst", work)
        return Event(output=_event_output(artifact))

    async def resources() -> Event:
        async def work() -> AllocationProposal:
            assert ctx.world is not None
            artifact = first_pass(ctx.world, ctx.scenario)
            ctx.proposal = artifact
            await ctx.save_artifact("proposal", artifact, agent_id="resources")
            return artifact

        artifact = await ctx.run_agent("resources", "Resource Coordinator", work)
        return Event(output={"proposal_hash": artifact.hash, "revision": 0})

    async def access() -> Event:
        async def work() -> AccessReport:
            assert ctx.world is not None
            artifact = build_access_report(ctx.world, ctx.scenario)
            ctx.access = artifact
            await ctx.save_artifact("access", artifact, agent_id="access")
            return artifact

        artifact = await ctx.run_agent("access", "Accessibility Agent", work)
        return Event(output={"access_hash": artifact.hash, "closed": artifact.closed_edge_ids})

    async def synchronize(node_input: Any) -> Event:
        await ctx.emit(
            "join.completed",
            agent_id="director",
            status="completed",
            payload={
                "branches": ["conditions", "resources", "access"],
                "joined": bool(node_input),
            },
        )
        return Event(output={"joined": True})

    async def preflight() -> Event:
        async def work() -> VerificationReport:
            if (
                ctx.world is None
                or ctx.proposal is None
                or ctx.access is None
                or ctx.conditions is None
            ):
                raise RuntimeError("preflight is missing an upstream artifact")
            artifact = verify_preflight(
                ctx.world,
                ctx.scenario,
                ctx.proposal,
                ctx.access,
                ctx.conditions,
                revision=ctx.revision,
            )
            ctx.preflight = artifact
            await ctx.save_artifact("preflight", artifact, agent_id="critic")
            ctx.remember_findings(artifact)
            for finding in artifact.findings:
                await ctx.emit(
                    "verification.finding",
                    agent_id="critic",
                    status=finding.severity,
                    payload=finding.model_dump(mode="json"),
                )
            return artifact

        artifact = await ctx.run_agent("critic", "Critic / Verifier", work)
        if artifact.passed:
            return Event(output=_event_output(artifact), route="pass")
        if ctx.revision < ctx.max_revisions:
            return Event(output=_event_output(artifact), route="revise")
        ctx.needs_attention = True
        return Event(output=_event_output(artifact), route="exhausted")

    async def revision() -> Event:
        async def work() -> AllocationProposal:
            if (
                ctx.world is None
                or ctx.conditions is None
                or ctx.access is None
                or ctx.proposal is None
            ):
                raise RuntimeError("revision is missing an upstream artifact")
            trigger_stage: str = "preflight"
            trigger_report = ctx.preflight
            if ctx.outcome is not None and not ctx.outcome.passed:
                trigger_stage = "outcome"
                trigger_report = ctx.outcome
            findings = trigger_report.findings if trigger_report is not None else []
            codes = sorted({f.code for f in findings if f.severity == "error"}) or ["REPAIR"]
            before = ctx.proposal
            ctx.revision += 1
            await ctx.emit(
                "revision.started",
                agent_id="critic",
                status="active",
                payload={
                    "attempt": ctx.revision,
                    "trigger": trigger_stage,
                    "codes": codes,
                },
            )
            after = repair_pass(
                ctx.world,
                ctx.scenario,
                ctx.conditions,
                set(ctx.access.closed_edge_ids),
                revision=ctx.revision,
                reason="; ".join(codes),
            )
            changes, changed, deferred = assignment_delta(before, after)
            record = RevisionRecord(
                attempt=ctx.revision,
                trigger_stage=trigger_stage,
                trigger_codes=codes,
                changes=changes,
                assignments_changed=changed,
                demands_deferred=deferred,
            )
            ctx.revisions.append(record)
            ctx.proposal = after
            ctx.preflight = None
            ctx.outcome = None
            ctx.simulation = None
            await ctx.save_artifact("proposal", after, agent_id="critic")
            await ctx.emit(
                "revision.completed",
                agent_id="critic",
                status="completed",
                payload={
                    "attempt": ctx.revision,
                    "changes": changes,
                    "assignments_changed": changed,
                    "demands_deferred": deferred,
                },
            )
            return after

        await ctx.run_agent("critic", "Critic / Verifier", work)
        return Event(output={"revision": ctx.revision})

    async def simulate_node() -> Event:
        async def work() -> SimulationResult:
            if (
                ctx.world is None
                or ctx.proposal is None
                or ctx.conditions is None
                or ctx.access is None
            ):
                raise RuntimeError("simulation is missing an upstream artifact")
            artifact = simulate(
                ctx.world,
                ctx.scenario,
                ctx.proposal,
                ctx.conditions,
                ctx.access,
                revision=ctx.revision,
            )
            ctx.simulation = artifact
            await ctx.save_artifact("simulation", artifact, agent_id="simulation")
            return artifact

        await ctx.run_agent("simulation", "Simulation Agent", work)
        return Event(output={"simulation_hash": ctx.simulation.hash if ctx.simulation else ""})

    async def outcome() -> Event:
        async def work() -> VerificationReport:
            if ctx.world is None or ctx.proposal is None or ctx.simulation is None:
                raise RuntimeError("outcome verification is missing an upstream artifact")
            artifact = verify_outcome(
                ctx.world, ctx.scenario, ctx.proposal, ctx.simulation, revision=ctx.revision
            )
            ctx.outcome = artifact
            await ctx.save_artifact("outcome", artifact, agent_id="critic")
            ctx.remember_findings(artifact)
            for finding in artifact.findings:
                await ctx.emit(
                    "verification.finding",
                    agent_id="critic",
                    status=finding.severity,
                    payload=finding.model_dump(mode="json"),
                )
            return artifact

        artifact = await ctx.run_agent("critic", "Critic / Verifier", work)
        if artifact.passed:
            return Event(output=_event_output(artifact), route="report")
        if ctx.revision < ctx.max_revisions:
            return Event(output=_event_output(artifact), route="revise")
        ctx.needs_attention = True
        return Event(output=_event_output(artifact), route="report")

    async def reporter() -> Event:
        await ctx.begin_agent("reporter", "Reporter")
        try:
            if (
                ctx.world is None
                or ctx.proposal is None
                or ctx.conditions is None
                or ctx.access is None
                or ctx.preflight is None
                or ctx.outcome is None
                or ctx.simulation is None
            ):
                raise RuntimeError("reporter is missing an upstream artifact")
            placeholder = AgentSummary(
                id="reporter",
                name="Reporter",
                mode="deterministic",
                status="completed",
                duration_ms=0,
            )
            agents = [*ctx.agent_summaries(exclude={"reporter"}), placeholder]
            report = build_report(
                run_id=ctx.run_id,
                scenario=ctx.scenario,
                world=ctx.world,
                proposal=ctx.proposal,
                conditions=ctx.conditions,
                access=ctx.access,
                preflight=ctx.preflight,
                outcome=ctx.outcome,
                simulation=ctx.simulation,
                findings=ctx.finding_history,
                revisions=ctx.revisions,
                agents=agents,
                model_calls=0,
            )
            runtime = ctx.agent_runtime["reporter"]
            duration = int((time.perf_counter() - runtime.started_perf) * 1000)
            report.agents = [
                *[a for a in report.agents if a.id != "reporter"],
                AgentSummary(
                    id="reporter",
                    name="Reporter",
                    mode="deterministic",
                    status="completed",
                    duration_ms=duration,
                    artifact_hash=report.result_hash,
                    calls=1,
                    note="Deterministic report template.",
                ),
            ]
            report.markdown = build_markdown(report)
            ctx.needs_attention = (
                ctx.needs_attention or not ctx.preflight.passed or not ctx.outcome.passed
            )
            await ctx.save_artifact("report", report, agent_id="reporter")
            await ctx.save_report(report)
            await ctx.finish_agent("reporter", status="completed", artifact_hash=report.result_hash)
            return Event(output={"report_id": report.id, "needs_attention": ctx.needs_attention})
        except Exception as exc:
            await ctx.finish_agent("reporter", status="failed", note=str(exc))
            raise

    async def commit() -> Event:
        if ctx.report is None:
            raise RuntimeError("cannot commit without a report")
        ctx.committed = True
        status = "needs_attention" if ctx.needs_attention else "completed"
        await ctx.emit(
            "run.committed",
            agent_id="director",
            status=status,
            payload={
                "result_hash": ctx.report.result_hash,
                "report_id": ctx.report.id,
                "revisions": ctx.revision,
                "status": status,
            },
        )
        return Event(
            output={
                "committed": True,
                "status": status,
                "result_hash": ctx.report.result_hash,
            }
        )

    intake_node = FunctionNode(func=intake, name="intake")
    world_node = FunctionNode(func=world, name="world")
    conditions_node = FunctionNode(func=conditions, name="conditions")
    resources_node = FunctionNode(func=resources, name="resources")
    access_node = FunctionNode(func=access, name="access")
    join_node = JoinNode(name="join")
    sync_node = FunctionNode(func=synchronize, name="synchronize")
    preflight_node = FunctionNode(func=preflight, name="preflight")
    revision_node = FunctionNode(func=revision, name="revision")
    simulate_node = FunctionNode(func=simulate_node, name="simulation")
    outcome_node = FunctionNode(func=outcome, name="outcome")
    reporter_node = FunctionNode(func=reporter, name="reporter")
    commit_node = FunctionNode(func=commit, name="commit")

    return Workflow(
        name=f"astergrid_{ctx.run_id}",
        max_concurrency=4,
        edges=[
            ("START", intake_node),
            (intake_node, world_node),
            (world_node, conditions_node),
            (world_node, resources_node),
            (world_node, access_node),
            (conditions_node, join_node),
            (resources_node, join_node),
            (access_node, join_node),
            (join_node, sync_node),
            (sync_node, preflight_node),
            (
                preflight_node,
                {
                    "pass": simulate_node,
                    "revise": revision_node,
                    "exhausted": simulate_node,
                },
            ),
            (revision_node, preflight_node),
            (simulate_node, outcome_node),
            (outcome_node, {"report": reporter_node, "revise": revision_node}),
            (reporter_node, commit_node),
        ],
    )


async def run_workflow(ctx: RunContext) -> None:
    workflow = build_workflow(ctx)
    runner = InMemoryRunner(agent=workflow, app_name="astergrid")
    session = await runner.session_service.create_session(
        app_name="astergrid",
        user_id="local",
        state={"run_id": ctx.run_id},
    )
    try:
        async for event in runner.run_async(
            user_id="local",
            session_id=session.id,
            new_message=types.Content(role="user", parts=[types.Part(text="execute")]),
        ):
            error_code = getattr(event, "error_code", None)
            if error_code:
                raise RuntimeError(
                    f"ADK workflow error {error_code}: "
                    f"{getattr(event, 'error_message', 'unknown error')}"
                )
    finally:
        close_result = runner.close()
        if inspect.isawaitable(close_result):
            await close_result
    if not ctx.committed:
        raise RuntimeError("ADK workflow finished without committing a validated report.")
