from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, field
from typing import Literal

from .hazards import closed_edge_ids, hazard_state, planning_horizon_min, road_states
from .models import (
    AccessReport,
    AllocationProposal,
    AssetState,
    ConditionsReport,
    Demand,
    InvariantCheck,
    ScenarioConfig,
    SimulationEvent,
    SimulationMetrics,
    SimulationResult,
    SimulationRoute,
    Snapshot,
    World,
    canonical_hash,
)
from .routing import route

ALGORITHM_VERSION = "simulation-1.0"


@dataclass
class MoveSegment:
    start: float
    end: float
    points: list[tuple[float, float]]
    edge_ids: list[str]
    edge_start_fractions: list[float]
    kind: Literal["primary", "secondary"]
    target_node_id: str

    def position(self, t: float) -> tuple[tuple[float, float], str, float]:
        duration = max(0.001, self.end - self.start)
        fraction = max(0.0, min(1.0, (t - self.start) / duration))
        return _point_at_fraction(self.points, fraction), "en_route", fraction


@dataclass
class ServiceSegment:
    start: float
    end: float
    point: tuple[float, float]
    node_id: str

    def position(self, t: float) -> tuple[tuple[float, float], str, float]:
        duration = max(0.001, self.end - self.start)
        fraction = max(0.0, min(1.0, (t - self.start) / duration))
        return self.point, "serving", fraction


Segment = MoveSegment | ServiceSegment


@dataclass
class AssignmentTimeline:
    assignment: object
    demand: Demand
    asset: object
    segments: list[Segment] = field(default_factory=list)
    primary_arrival: float = 0.0
    service_end: float = 0.0
    end_point: tuple[float, float] = (0.0, 0.0)
    end_node_id: str = ""
    blocked_at: float | None = None
    blocked_edge_id: str | None = None
    blocked_point: tuple[float, float] | None = None
    blocked_progress: float = 0.0
    failure_reason: str = ""

    @property
    def start(self) -> float:
        return float(self.assignment.start_min)  # type: ignore[attr-defined]

    @property
    def end(self) -> float:
        return float(self.assignment.end_min)  # type: ignore[attr-defined]

    @property
    def failed(self) -> bool:
        return bool(self.failure_reason) or self.blocked_at is not None

    def position_at(self, t: float) -> tuple[tuple[float, float], str, float]:
        if self.blocked_at is not None and t >= self.blocked_at:
            return (
                self.blocked_point or self.end_point,
                "blocked",
                self.blocked_progress,
            )
        if self.failure_reason:
            return self.end_point, "failed", 0.0
        if t < self.start:
            first = self.segments[0] if self.segments else None
            if isinstance(first, MoveSegment):
                return first.points[0], "staged", 0.0
            if isinstance(first, ServiceSegment):
                return first.point, "staged", 0.0
            return self.end_point, "staged", 0.0
        for segment in self.segments:
            if t < segment.start:
                if isinstance(segment, MoveSegment):
                    return segment.points[0], "staged", 0.0
                return segment.point, "staged", 0.0
            if t <= segment.end:
                return segment.position(t)
        return self.end_point, "complete", 1.0


def _cumulative(points: list[tuple[float, float]]) -> list[float]:
    values = [0.0]
    for index in range(1, len(points)):
        values.append(
            values[-1]
            + math.hypot(
                points[index][0] - points[index - 1][0],
                points[index][1] - points[index - 1][1],
            )
        )
    return values


def _point_at_fraction(points: list[tuple[float, float]], fraction: float) -> tuple[float, float]:
    if not points:
        return (0.0, 0.0)
    if len(points) == 1:
        return points[0]
    cumulative = _cumulative(points)
    total = cumulative[-1]
    if total <= 0:
        return points[0]
    target = max(0.0, min(1.0, fraction)) * total
    for index in range(1, len(points)):
        if cumulative[index] >= target:
            span = cumulative[index] - cumulative[index - 1]
            local = 0.0 if span <= 0 else (target - cumulative[index - 1]) / span
            return (
                points[index - 1][0] + (points[index][0] - points[index - 1][0]) * local,
                points[index - 1][1] + (points[index][1] - points[index - 1][1]) * local,
            )
    return points[-1]


def _path_for_route(
    world: World, start_node_id: str, edge_ids: list[str]
) -> tuple[list[tuple[float, float]], str, list[float], list[str]] | None:
    node_by_id = {n.id: n for n in world.nodes}
    edge_by_id = {e.id: e for e in world.edges}
    if start_node_id not in node_by_id:
        return None
    current = start_node_id
    points = [(node_by_id[current].x, node_by_id[current].z)]
    edge_starts: list[float] = []
    ordered_edges: list[str] = []
    for edge_id in edge_ids:
        edge = edge_by_id.get(edge_id)
        if edge is None:
            return None
        if edge.a == current:
            sequence = edge.polyline[1:]
            next_node = edge.b
        elif edge.b == current:
            sequence = list(reversed(edge.polyline))[1:]
            next_node = edge.a
        else:
            return None
        cumulative = _cumulative(points)
        edge_starts.append(cumulative[-1])
        points.extend(sequence)
        ordered_edges.append(edge.id)
        current = next_node
    cumulative = _cumulative(points)
    total = max(cumulative[-1], 0.001)
    fractions = [value / total for value in edge_starts]
    return points, current, fractions, ordered_edges


def _build_timeline(
    world: World,
    scenario: ScenarioConfig,
    assignment,
    demand: Demand,
    conditions: ConditionsReport,
    planning_closed: set[str],
    closed_at,
) -> AssignmentTimeline:
    asset = next(a for a in world.assets if a.id == assignment.asset_id)
    facility_by_id = {f.id: f for f in world.facilities}
    node_by_id = {n.id: n for n in world.nodes}
    timeline = AssignmentTimeline(assignment=assignment, demand=demand, asset=asset)
    primary = _path_for_route(world, assignment.origin_node_id, assignment.route_edge_ids)
    if primary is None:
        timeline.failure_reason = "primary route does not connect its declared origin and target"
        timeline.end_node_id = assignment.target_node_id
        timeline.end_point = (
            node_by_id[assignment.target_node_id].x,
            node_by_id[assignment.target_node_id].z,
        )
        return timeline
    primary_points, target_node, primary_fractions, primary_edges = primary
    if target_node != assignment.target_node_id:
        timeline.failure_reason = "primary route endpoint does not match assignment target"
        timeline.end_node_id = target_node
        timeline.end_point = primary_points[-1]
        return timeline
    start = assignment.start_min
    primary_end = start + assignment.travel_min
    service_end = primary_end + assignment.service_min
    target_point = (node_by_id[target_node].x, node_by_id[target_node].z)
    timeline.primary_arrival = primary_end
    timeline.service_end = service_end
    timeline.segments.append(
        MoveSegment(
            start=start,
            end=primary_end,
            points=primary_points,
            edge_ids=primary_edges,
            edge_start_fractions=primary_fractions,
            kind="primary",
            target_node_id=target_node,
        )
    )
    timeline.segments.append(
        ServiceSegment(start=primary_end, end=service_end, point=target_point, node_id=target_node)
    )
    secondary_duration = max(0.0, assignment.end_min - service_end)
    end_point = target_point
    end_node = demand.node_id
    if secondary_duration > 0 and demand.destination_facility_id:
        facility = facility_by_id.get(demand.destination_facility_id)
        if facility is None:
            timeline.failure_reason = "destination facility missing"
        else:
            secondary = route(
                world,
                demand.node_id,
                facility.node_id,
                closed_edges=planning_closed,
                travel_factor=conditions.travel_factor,
                visibility_factor=conditions.visibility_factor,
            )
            if not secondary.reachable:
                timeline.failure_reason = "secondary leg is unreachable"
            else:
                path = _path_for_route(world, demand.node_id, secondary.edge_ids)
                if path is None:
                    timeline.failure_reason = "secondary route path could not be reconstructed"
                else:
                    points, destination_node, fractions, edges = path
                    timeline.segments.append(
                        MoveSegment(
                            start=service_end,
                            end=assignment.end_min,
                            points=points,
                            edge_ids=edges,
                            edge_start_fractions=fractions,
                            kind="secondary",
                            target_node_id=destination_node,
                        )
                    )
                    end_point = points[-1]
                    end_node = destination_node
    timeline.end_point = end_point
    timeline.end_node_id = end_node
    for segment in timeline.segments:
        if not isinstance(segment, MoveSegment):
            continue
        fraction_scale = max(0.001, segment.end - segment.start)
        for edge_id, fraction in zip(segment.edge_ids, segment.edge_start_fractions, strict=True):
            at = segment.start + fraction_scale * fraction
            if edge_id in closed_at(at):
                timeline.blocked_at = at
                timeline.blocked_edge_id = edge_id
                timeline.blocked_point = _point_at_fraction(segment.points, fraction)
                timeline.blocked_progress = fraction
                return timeline
    return timeline


def _clock(start_hour: int, sim_min: int) -> str:
    minutes = start_hour * 60 + int(round(sim_min))
    hour = (minutes // 60) % 24
    minute = minutes % 60
    return f"{hour:02d}:{minute:02d}"


def _median_response(timelines: list[AssignmentTimeline], t: float) -> float:
    arrived = [
        timeline.primary_arrival - timeline.start
        for timeline in timelines
        if timeline.primary_arrival <= t and not timeline.failed
    ]
    if not arrived:
        return 0.0
    return round(float(statistics.median(arrived)), 1)


def _metrics_at(
    world: World,
    scenario: ScenarioConfig,
    timelines: list[AssignmentTimeline],
    unassigned_count: int,
    t: float,
    *,
    final: bool,
) -> SimulationMetrics:
    completed = [timeline for timeline in timelines if not timeline.failed and t >= timeline.end]
    completed_demand_ids = {timeline.demand.id for timeline in completed}
    failed_demand_ids = {timeline.demand.id for timeline in timelines if timeline.failed}
    total_tasks = len(world.demands)
    completed_tasks = len(completed_demand_ids)
    coverage_demands = [d for d in world.demands if d.kind == "evacuate"]
    delivery_demands = [d for d in world.demands if d.kind == "deliver"]
    survey_demands = [d for d in world.demands if d.kind == "survey"]

    def ratio(demands: list[Demand], completed_ids: set[str]) -> float:
        total = sum(d.quantity for d in demands)
        if total <= 0:
            return 100.0
        done = sum(
            timeline.assignment.load
            for timeline in completed
            if timeline.demand.id in completed_ids
            and any(d.id == timeline.demand.id for d in demands)
        )
        return round(min(100.0, done / total * 100.0), 1)

    coverage = ratio(coverage_demands, completed_demand_ids)
    if not coverage_demands:
        coverage = ratio(survey_demands, completed_demand_ids)
    delivery = ratio(delivery_demands, completed_demand_ids)
    survey = ratio(survey_demands, completed_demand_ids)
    response = _median_response(timelines, t)
    busy = 0.0
    for timeline in timelines:
        if t <= timeline.start:
            continue
        busy += max(0.0, min(t, timeline.end) - timeline.start)
    denominator = max(1.0, len(world.assets) * max(t, 1.0))
    utilization = round(min(100.0, busy / denominator * 100.0), 1)
    if final:
        unmet = max(0, total_tasks - completed_tasks)
    else:
        unmet = len({*failed_demand_ids}) + unassigned_count
    objectives = scenario.objectives
    total_weight = max(
        0.001,
        objectives.coverage + objectives.delivery + objectives.response_time + objectives.survey,
    )
    response_score = max(0.0, 1.0 - min(1.0, response / 120.0)) if response else 0.0
    objective_score = round(
        100.0
        * (
            coverage / 100.0 * objectives.coverage
            + delivery / 100.0 * objectives.delivery
            + response_score * objectives.response_time
            + survey / 100.0 * objectives.survey
        )
        / total_weight,
        1,
    )
    return SimulationMetrics(
        coverage_pct=coverage,
        delivery_pct=delivery,
        survey_pct=survey,
        median_response_min=response,
        utilization_pct=utilization,
        unmet_demand=unmet,
        completed_tasks=completed_tasks,
        total_tasks=total_tasks,
        objective_score=objective_score,
    )


def simulate(
    world: World,
    scenario: ScenarioConfig,
    proposal: AllocationProposal,
    conditions: ConditionsReport,
    access: AccessReport,
    *,
    revision: int,
) -> SimulationResult:
    planning_closed = set(access.closed_edge_ids)
    horizon = planning_horizon_min(scenario)
    del horizon
    closed_cache: dict[float, set[str]] = {}

    def closed_at(t: float) -> set[str]:
        key = round(max(0.0, t), 1)
        if key not in closed_cache:
            closed_cache[key] = closed_edge_ids(world, scenario, key)
        return closed_cache[key]

    demands = {d.id: d for d in world.demands}
    timelines: list[AssignmentTimeline] = []
    for assignment in proposal.assignments:
        demand = demands.get(assignment.demand_id)
        if demand is None:
            continue
        timelines.append(
            _build_timeline(
                world,
                scenario,
                assignment,
                demand,
                conditions,
                planning_closed,
                closed_at,
            )
        )

    step = 10 if scenario.duration_minutes <= 360 else 15
    ticks = list(range(0, scenario.duration_minutes + 1, step))
    if ticks[-1] != scenario.duration_minutes:
        ticks.append(scenario.duration_minutes)

    events: list[SimulationEvent] = []
    for timeline in timelines:
        assignment = timeline.assignment
        demand = timeline.demand
        if timeline.failure_reason:
            events.append(
                SimulationEvent(
                    id="",
                    t_min=max(0, int(round(timeline.start))),
                    kind="task_failed",
                    entity_ids=[assignment.id, demand.id, timeline.asset.id],
                    message=f"{timeline.asset.callsign} cannot serve {demand.id}: {timeline.failure_reason}",
                    severity="error",
                )
            )
            continue
        events.append(
            SimulationEvent(
                id="",
                t_min=max(0, int(round(timeline.start))),
                kind="dispatch",
                entity_ids=[assignment.id, demand.id, timeline.asset.id],
                message=f"{timeline.asset.callsign} dispatched to {demand.label}",
            )
        )
        events.append(
            SimulationEvent(
                id="",
                t_min=max(0, int(round(timeline.primary_arrival))),
                kind="arrival",
                entity_ids=[assignment.id, demand.id, timeline.asset.id],
                message=f"{timeline.asset.callsign} arrived at {demand.id}",
            )
        )
        events.append(
            SimulationEvent(
                id="",
                t_min=max(0, int(round(timeline.service_end))),
                kind="service_complete",
                entity_ids=[assignment.id, demand.id, timeline.asset.id],
                message=f"{timeline.asset.callsign} completed on-site service for {demand.id}",
            )
        )
        if timeline.blocked_at is not None:
            events.append(
                SimulationEvent(
                    id="",
                    t_min=max(0, int(round(timeline.blocked_at))),
                    kind="blocked",
                    entity_ids=[assignment.id, demand.id, timeline.asset.id],
                    message=(
                        f"{timeline.asset.callsign} blocked at {timeline.blocked_edge_id}; "
                        "no validated detour was pre-planned"
                    ),
                    severity="error",
                )
            )
            events.append(
                SimulationEvent(
                    id="",
                    t_min=max(0, int(round(timeline.blocked_at))),
                    kind="task_failed",
                    entity_ids=[assignment.id, demand.id, timeline.asset.id],
                    message=f"{demand.id} failed after a dynamic closure at {timeline.blocked_edge_id}",
                    severity="error",
                )
            )
        else:
            events.append(
                SimulationEvent(
                    id="",
                    t_min=max(0, int(round(timeline.end))),
                    kind="task_completed",
                    entity_ids=[assignment.id, demand.id, timeline.asset.id],
                    message=f"{timeline.asset.callsign} completed {demand.label}",
                )
            )
    for unassigned in proposal.unassigned:
        events.append(
            SimulationEvent(
                id="",
                t_min=0,
                kind="task_deferred",
                entity_ids=[unassigned.demand_id],
                message=f"{unassigned.demand_id} deferred: {unassigned.reason}",
                severity="warning",
            )
        )

    # Road-state transitions are real events, not UI decoration.
    previous_closed: set[str] = set()
    edge_by_id = {e.id: e for e in world.edges}
    for tick in ticks:
        current = closed_at(tick)
        for edge_id in sorted(current - previous_closed):
            edge = edge_by_id.get(edge_id)
            events.append(
                SimulationEvent(
                    id="",
                    t_min=tick,
                    kind="road_closed",
                    entity_ids=[edge_id],
                    message=f"{edge.label or edge_id} closed: {('hazard threshold' if edge else 'road state')}",
                    severity="warning",
                )
            )
        for edge_id in sorted(previous_closed - current):
            edge = edge_by_id.get(edge_id)
            events.append(
                SimulationEvent(
                    id="",
                    t_min=tick,
                    kind="road_open",
                    entity_ids=[edge_id],
                    message=f"{edge.label or edge_id} reopened",
                )
            )
        previous_closed = current

    kind_rank = {
        "dispatch": 0,
        "arrival": 1,
        "service_complete": 2,
        "task_completed": 3,
        "blocked": 4,
        "task_failed": 5,
        "task_deferred": 6,
        "road_closed": 7,
        "road_open": 8,
        "rerouted": 9,
        "hazard_threshold": 10,
    }
    events.sort(key=lambda e: (e.t_min, kind_rank.get(e.kind, 99), e.entity_ids, e.message))
    for index, event in enumerate(events):
        event.id = f"EV-{index + 1:03d}"

    snapshots: list[Snapshot] = []
    assets = world.assets
    node_by_id = {n.id: n for n in world.nodes}
    for tick in ticks:
        asset_states: list[AssetState] = []
        for asset in assets:
            asset_timelines = [t for t in timelines if t.asset.id == asset.id]
            active: AssignmentTimeline | None = None
            last_completed: AssignmentTimeline | None = None
            for timeline in sorted(asset_timelines, key=lambda t: t.start):
                if timeline.blocked_at is not None and tick >= timeline.blocked_at:
                    active = timeline
                    break
                if tick < timeline.start:
                    break
                if tick <= timeline.end:
                    active = timeline
                    break
                last_completed = timeline
            if active is not None:
                point, status, progress = active.position_at(tick)
                asset_states.append(
                    AssetState(
                        id=asset.id,
                        callsign=asset.callsign,
                        type=asset.type,
                        x=round(point[0], 1),
                        z=round(point[1], 1),
                        status=status,  # type: ignore[arg-type]
                        assignment_id=active.assignment.id,
                        demand_id=active.demand.id,
                        progress=round(progress, 3),
                    )
                )
                continue
            failed_timeline = next((t for t in asset_timelines if t.failure_reason), None)
            if failed_timeline is not None and tick >= failed_timeline.start:
                point = failed_timeline.end_point
                status = "failed"
                assignment_id = failed_timeline.assignment.id
                demand_id = failed_timeline.demand.id
            elif last_completed is not None:
                point = last_completed.end_point
                status = "complete"
                assignment_id = last_completed.assignment.id
                demand_id = last_completed.demand.id
            elif asset_timelines and tick < min(t.start for t in asset_timelines):
                point = (node_by_id[asset.home_node_id].x, node_by_id[asset.home_node_id].z)
                status = "staged"
                assignment_id = None
                demand_id = None
            else:
                point = (node_by_id[asset.home_node_id].x, node_by_id[asset.home_node_id].z)
                status = "complete" if asset_timelines else "staged"
                assignment_id = None
                demand_id = None
            asset_states.append(
                AssetState(
                    id=asset.id,
                    callsign=asset.callsign,
                    type=asset.type,
                    x=round(point[0], 1),
                    z=round(point[1], 1),
                    status=status,  # type: ignore[arg-type]
                    assignment_id=assignment_id,
                    demand_id=demand_id,
                    progress=1.0 if status == "complete" else 0.0,
                )
            )
        metrics = _metrics_at(
            world,
            scenario,
            timelines,
            len(proposal.unassigned),
            tick,
            final=tick >= scenario.duration_minutes,
        )
        snapshots.append(
            Snapshot(
                tick=len(snapshots),
                sim_time_min=tick,
                clock=_clock(scenario.start_hour, tick),
                assets=asset_states,
                roads=road_states(world, scenario, tick),
                hazard=hazard_state(world, scenario, tick),
                metrics=metrics,
                event_ids=[e.id for e in events if e.t_min <= tick],
            )
        )

    final_metrics = (
        snapshots[-1].metrics
        if snapshots
        else _metrics_at(
            world,
            scenario,
            timelines,
            len(proposal.unassigned),
            scenario.duration_minutes,
            final=True,
        )
    )
    routes: list[SimulationRoute] = []
    for timeline in timelines:
        routes.append(
            SimulationRoute(
                assignment_id=timeline.assignment.id,
                demand_id=timeline.demand.id,
                asset_id=timeline.asset.id,
                edge_ids=timeline.assignment.route_edge_ids,
                state="blocked" if timeline.failed else "validated",
                label=f"{timeline.asset.callsign} · {timeline.demand.label}",
            )
        )
    # Invariants are computed from actual plan state.
    continuity_ok = True
    continuity_detail: list[str] = []
    by_asset: dict[str, list[AssignmentTimeline]] = {}
    for timeline in timelines:
        by_asset.setdefault(timeline.asset.id, []).append(timeline)
    for asset in world.assets:
        expected = asset.home_node_id
        for timeline in sorted(by_asset.get(asset.id, []), key=lambda t: t.start):
            if timeline.assignment.origin_node_id != expected:
                continuity_ok = False
                continuity_detail.append(
                    f"{timeline.assignment.id} starts at {timeline.assignment.origin_node_id}, "
                    f"expected {expected}"
                )
            expected = timeline.end_node_id or expected
    intervals_ok = True
    for items in by_asset.values():
        ordered = sorted(items, key=lambda t: t.start)
        for previous, current in zip(ordered, ordered[1:], strict=False):
            if current.start < previous.end - 0.1:
                intervals_ok = False
    capacity_ok = all(
        timeline.assignment.load <= timeline.asset.capacity + 0.01 for timeline in timelines
    )
    windows_ok = all(
        timeline.start >= timeline.demand.window_start_min - 0.1
        and timeline.end <= timeline.demand.window_end_min + 0.1
        for timeline in timelines
    )
    shelter_loads: dict[str, float] = {}
    for timeline in timelines:
        if timeline.demand.kind == "evacuate" and timeline.demand.destination_facility_id:
            shelter_loads[timeline.demand.destination_facility_id] = (
                shelter_loads.get(timeline.demand.destination_facility_id, 0.0)
                + timeline.assignment.load
            )
    facility_by_id = {f.id: f for f in world.facilities}
    shelter_ok = all(
        load <= facility_by_id[fid].capacity + 0.01
        for fid, load in shelter_loads.items()
        if fid in facility_by_id
    )
    monotonic_ok = all(
        snapshots[i].sim_time_min < snapshots[i + 1].sim_time_min for i in range(len(snapshots) - 1)
    )
    critical_unassigned = any(u.priority >= 5 for u in proposal.unassigned)
    invariants = [
        InvariantCheck(
            code="snapshot_monotonic",
            passed=monotonic_ok,
            detail="Snapshots advance in strictly increasing simulation time.",
        ),
        InvariantCheck(
            code="asset_route_continuity",
            passed=continuity_ok,
            detail="; ".join(continuity_detail)
            if not continuity_ok
            else "Every sortie starts where the asset ended.",
        ),
        InvariantCheck(
            code="no_double_booking",
            passed=intervals_ok,
            detail="No asset holds two overlapping sorties."
            if intervals_ok
            else "At least one asset has overlapping sorties.",
        ),
        InvariantCheck(
            code="capacity_respected",
            passed=capacity_ok,
            detail="Every load is within asset capacity."
            if capacity_ok
            else "At least one load exceeds asset capacity.",
        ),
        InvariantCheck(
            code="time_windows_respected",
            passed=windows_ok,
            detail="Every sortie fits its demand window."
            if windows_ok
            else "At least one sortie misses its demand window.",
        ),
        InvariantCheck(
            code="shelter_capacity",
            passed=shelter_ok,
            detail="Shelter loads are within capacity."
            if shelter_ok
            else "At least one shelter is over capacity.",
        ),
        InvariantCheck(
            code="critical_demands_assigned",
            passed=not critical_unassigned,
            detail="All priority-5 demands have an assignment."
            if not critical_unassigned
            else "At least one priority-5 demand is unassigned.",
        ),
    ]

    result = SimulationResult(
        id="",
        snapshots=snapshots,
        events=events,
        routes=routes,
        metrics=final_metrics,
        invariants=invariants,
        algorithm_version=ALGORITHM_VERSION,
        revision=revision,
        duration_min=scenario.duration_minutes,
    )
    result.hash = canonical_hash(result.model_dump(mode="json", exclude={"id", "hash"}))
    result.id = f"SIM-{result.hash[:10]}"
    return result
