from __future__ import annotations

from collections import defaultdict

from .hazards import planning_horizon_min
from .models import (
    AccessReport,
    AllocationProposal,
    ConditionsReport,
    Finding,
    ScenarioConfig,
    SimulationResult,
    VerificationReport,
    World,
)
from .routing import route

VERSION = "verifier-1.0"


class _Findings:
    def __init__(self) -> None:
        self.items: list[Finding] = []

    def add(
        self,
        severity: str,
        code: str,
        message: str,
        entity_ids: list[str] | None = None,
        evidence: dict | None = None,
        repair_hint: str = "",
    ) -> None:
        self.items.append(
            Finding(
                id=f"F-{len(self.items) + 1:03d}",
                severity=severity,  # type: ignore[arg-type]
                code=code,
                message=message,
                entity_ids=entity_ids or [],
                evidence=evidence or {},
                repair_hint=repair_hint,
            )
        )

    @property
    def errors(self) -> list[Finding]:
        return [f for f in self.items if f.severity == "error"]


def _preflight_report(
    findings: _Findings, checked_count: int, revision: int, metrics: dict
) -> VerificationReport:
    passed = not findings.errors
    summary = (
        f"Preflight passed {checked_count} checks with "
        f"{len(findings.errors)} error(s) and {len(findings.items) - len(findings.errors)} warning(s)."
        if not passed
        else f"Preflight passed {checked_count} checks with no blocking findings."
    )
    report = VerificationReport(
        id=f"PRE-{revision}",
        stage="preflight",
        passed=passed,
        findings=findings.items,
        checked_count=checked_count,
        revision=revision,
        summary=summary,
        metrics=metrics,
        mode="deterministic",
        version=VERSION,
    )
    return report.with_hash()


def verify_preflight(
    world: World,
    scenario: ScenarioConfig,
    proposal: AllocationProposal,
    access: AccessReport,
    conditions: ConditionsReport,
    *,
    revision: int,
) -> VerificationReport:
    findings = _Findings()
    world_demands = {d.id: d for d in world.demands}
    world_assets = {a.id: a for a in world.assets}
    world_edges = {e.id: e for e in world.edges}
    closed = set(access.closed_edge_ids)
    seen_assignment_ids: set[str] = set()
    by_asset: dict[str, list] = defaultdict(list)
    shelter_loads: dict[str, float] = defaultdict(float)
    checked = 0

    for assignment in proposal.assignments:
        checked += 1
        if assignment.id in seen_assignment_ids:
            findings.add(
                "error",
                "DUPLICATE_ASSIGNMENT",
                f"Assignment id {assignment.id} appears more than once.",
                [assignment.id],
            )
        seen_assignment_ids.add(assignment.id)
        demand = world_demands.get(assignment.demand_id)
        asset = world_assets.get(assignment.asset_id)
        if demand is None:
            findings.add(
                "error",
                "UNKNOWN_DEMAND",
                f"Assignment {assignment.id} references unknown demand {assignment.demand_id}.",
                [assignment.id, assignment.demand_id],
                repair_hint="Rebuild the assignment from a current world demand.",
            )
            continue
        if asset is None:
            findings.add(
                "error",
                "UNKNOWN_ASSET",
                f"Assignment {assignment.id} references unknown asset {assignment.asset_id}.",
                [assignment.id, assignment.asset_id],
                repair_hint="Choose an asset that exists in the current world.",
            )
            continue
        if asset.capability != demand.required_capability:
            findings.add(
                "error",
                "CAPABILITY_MISMATCH",
                f"{asset.callsign} cannot serve {demand.id}: requires {demand.required_capability}, "
                f"asset has {asset.capability}.",
                [assignment.id, asset.id, demand.id],
                repair_hint="Select a capable asset.",
            )
        if assignment.load > asset.capacity + 1e-6:
            findings.add(
                "error",
                "CAPACITY_OVERFLOW",
                f"{asset.callsign} load {assignment.load:g} exceeds capacity {asset.capacity:g}.",
                [assignment.id, asset.id],
                repair_hint="Split the sortie or choose a larger asset.",
            )
        if assignment.start_min < demand.window_start_min - 0.1:
            findings.add(
                "error",
                "WINDOW_START",
                f"{demand.id} starts before its window ({assignment.start_min:.0f} < "
                f"{demand.window_start_min}).",
                [assignment.id, demand.id],
                repair_hint="Delay dispatch to the demand window.",
            )
        if assignment.end_min > demand.window_end_min + 0.1:
            findings.add(
                "error",
                "WINDOW_MISSED",
                f"{demand.id} ends at T+{assignment.end_min:.0f}, after its window "
                f"T+{demand.window_end_min}.",
                [assignment.id, demand.id],
                repair_hint="Use a closer asset or relax the demand window.",
            )
        if assignment.start_min < asset.available_from_min - 0.1:
            findings.add(
                "error",
                "ASSET_NOT_AVAILABLE",
                f"{asset.callsign} is not available until T+{asset.available_from_min}.",
                [assignment.id, asset.id],
                repair_hint="Choose an available asset.",
            )
        if assignment.end_min > asset.available_until_min + 0.1:
            findings.add(
                "error",
                "ASSET_AVAILABILITY_END",
                f"{asset.callsign} becomes unavailable at T+{asset.available_until_min}.",
                [assignment.id, asset.id],
                repair_hint="Compress or reassign the task.",
            )

        missing_edges = [e for e in assignment.route_edge_ids if e not in world_edges]
        if missing_edges:
            findings.add(
                "error",
                "UNKNOWN_ROUTE_EDGE",
                f"{assignment.id} references unknown road edges: {', '.join(missing_edges)}.",
                [assignment.id, *missing_edges],
                repair_hint="Recompute the route from the current world graph.",
            )
        blocked = [e for e in assignment.route_edge_ids if e in closed]
        if blocked:
            findings.add(
                "error",
                "ROUTE_BLOCKED",
                f"{assignment.id} uses closed route segment(s) {', '.join(blocked)} at "
                f"T+{planning_horizon_min(scenario)}.",
                [assignment.id, asset.id, demand.id, *blocked],
                {
                    "closed_edges": sorted(closed),
                    "route_edges": assignment.route_edge_ids,
                },
                repair_hint="Reroute through an open crossing or defer the task.",
            )
        else:
            check = route(
                world,
                assignment.origin_node_id,
                demand.node_id,
                closed_edges=closed,
                travel_factor=conditions.travel_factor,
                visibility_factor=conditions.visibility_factor,
            )
            if not check.reachable:
                findings.add(
                    "error",
                    "ROUTE_UNREACHABLE",
                    f"No open route from {asset.callsign}'s base to {demand.id} at "
                    f"T+{planning_horizon_min(scenario)}.",
                    [assignment.id, asset.id, demand.id],
                    repair_hint="Defer the demand or select an asset on the reachable side.",
                )
        by_asset[asset.id].append(assignment)
        if demand.kind == "evacuate" and demand.destination_facility_id:
            shelter_loads[demand.destination_facility_id] += assignment.load
        if assignment.load + 1e-6 < demand.quantity:
            findings.add(
                "warning",
                "DEMAND_PARTIALLY_SERVED",
                f"{demand.id} receives {assignment.load:g}/{demand.quantity:g} {demand.unit}.",
                [assignment.id, demand.id],
                repair_hint="Add a second sortie if capacity is available.",
            )

    for asset_id, items in sorted(by_asset.items()):
        ordered = sorted(items, key=lambda a: (a.start_min, a.end_min, a.id))
        for index in range(1, len(ordered)):
            previous = ordered[index - 1]
            current = ordered[index]
            if current.start_min < previous.end_min - 0.01:
                findings.add(
                    "error",
                    "TIME_WINDOW_OVERLAP",
                    f"{asset_id} is double-booked: {previous.id} ends T+{previous.end_min:.0f}, "
                    f"{current.id} starts T+{current.start_min:.0f}.",
                    [previous.id, current.id, asset_id],
                    {
                        "first_interval": [previous.start_min, previous.end_min],
                        "second_interval": [current.start_min, current.end_min],
                    },
                    repair_hint="Reserve the asset calendar or select another capable asset.",
                )

    facilities = {f.id: f for f in world.facilities}
    for facility_id, load in sorted(shelter_loads.items()):
        facility = facilities.get(facility_id)
        if facility is None:
            findings.add(
                "error",
                "UNKNOWN_DESTINATION",
                f"Evacuation load references unknown destination {facility_id}.",
                [facility_id],
            )
            continue
        if load > facility.capacity:
            findings.add(
                "error",
                "SHELTER_CAPACITY",
                f"{facility.name} receives {load:g} persons, above capacity {facility.capacity}.",
                [facility.id],
                {"planned_load": load, "capacity": facility.capacity},
                repair_hint="Use another shelter or reduce the evacuation cohort.",
            )

    for unassigned in proposal.unassigned:
        if unassigned.priority >= 5:
            findings.add(
                "error",
                "CRITICAL_DEMAND_UNASSIGNED",
                f"Critical demand {unassigned.demand_id} is unassigned: {unassigned.reason}.",
                [unassigned.demand_id],
                repair_hint="Free a capable asset or resolve the route/capacity conflict.",
            )
        else:
            findings.add(
                "warning",
                "DEMAND_UNASSIGNED",
                f"{unassigned.demand_id} is unassigned: {unassigned.reason}.",
                [unassigned.demand_id],
            )

    metrics = {
        "assignments": len(proposal.assignments),
        "unassigned": len(proposal.unassigned),
        "blocked_routes": sum(
            1 for f in findings.items if f.code in ("ROUTE_BLOCKED", "ROUTE_UNREACHABLE")
        ),
        "overlaps": sum(1 for f in findings.items if f.code == "TIME_WINDOW_OVERLAP"),
        "critical_unassigned": sum(1 for u in proposal.unassigned if u.priority >= 5),
    }
    return _preflight_report(findings, max(checked, len(world.demands)), revision, metrics)


def verify_outcome(
    world: World,
    scenario: ScenarioConfig,
    proposal: AllocationProposal,
    simulation: SimulationResult,
    *,
    revision: int,
) -> VerificationReport:
    del scenario
    findings = _Findings()
    checked = 0
    for invariant in simulation.invariants:
        checked += 1
        if not invariant.passed:
            findings.add(
                "error",
                "SIMULATION_INVARIANT",
                f"{invariant.code}: {invariant.detail}",
                [simulation.id],
                {"code": invariant.code},
                repair_hint="Rebuild the plan and rerun the deterministic simulation.",
            )
    demand_by_id = {d.id: d for d in world.demands}
    failed_demands: set[str] = set()
    for event in simulation.events:
        checked += 1
        if event.kind in ("task_failed", "task_deferred", "blocked"):
            for entity_id in event.entity_ids:
                if entity_id in demand_by_id:
                    failed_demands.add(entity_id)
                    if event.kind == "task_failed" and demand_by_id[entity_id].priority >= 5:
                        findings.add(
                            "error",
                            "CRITICAL_TASK_FAILED",
                            f"Critical demand {entity_id} failed during simulation: {event.message}",
                            [simulation.id, entity_id],
                            {"event_id": event.id},
                            repair_hint="Re-plan around the dynamic closure.",
                        )
    if simulation.metrics.completed_tasks < simulation.metrics.total_tasks:
        findings.add(
            "warning",
            "TASKS_INCOMPLETE",
            f"{simulation.metrics.completed_tasks}/{simulation.metrics.total_tasks} tasks "
            f"completed; {simulation.metrics.unmet_demand} demand cohort(s) unmet.",
            [simulation.id],
        )
    blocked_routes = [r for r in simulation.routes if r.state == "blocked"]
    if blocked_routes:
        findings.add(
            "warning",
            "DYNAMIC_ROUTE_BLOCKED",
            f"{len(blocked_routes)} route(s) encountered a dynamic closure and were handled "
            f"by the simulation.",
            [r.assignment_id for r in blocked_routes],
            {"routes": [r.assignment_id for r in blocked_routes]},
        )
    if simulation.metrics.coverage_pct < 20:
        findings.add(
            "warning",
            "LOW_COVERAGE",
            f"Computed coverage is {simulation.metrics.coverage_pct:.1f}%.",
            [simulation.id],
        )
    passed = not findings.errors
    summary = (
        f"Outcome verification passed with {len(findings.errors)} error(s) and "
        f"{len(findings.items) - len(findings.errors)} warning(s)."
        if not passed
        else f"Outcome verification passed with {len(findings.items)} warning(s)."
    )
    report = VerificationReport(
        id=f"OUT-{revision}",
        stage="outcome",
        passed=passed,
        findings=findings.items,
        checked_count=max(checked, 1),
        revision=revision,
        summary=summary,
        metrics=simulation.metrics.model_dump(mode="json"),
        mode="deterministic",
        version=VERSION,
    )
    return report.with_hash()
