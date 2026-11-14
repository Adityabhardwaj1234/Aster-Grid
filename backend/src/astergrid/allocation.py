from __future__ import annotations

from dataclasses import dataclass

from .hazards import planning_horizon_min
from .models import (
    AllocationProposal,
    Assignment,
    ConditionsReport,
    Demand,
    ScenarioConfig,
    UnassignedDemand,
    World,
)
from .routing import RouteResult, route, weather_factor

ALGORITHM_VERSION = "allocator-1.0"


@dataclass
class _Candidate:
    asset_id: str
    origin_node_id: str
    end_node_id: str
    route: RouteResult
    start: float
    travel: float
    service: float
    secondary: float
    end: float
    load: float
    destination_facility_id: str | None


def _asset_speed_penalty(speed_kph: float) -> float:
    return max(0.65, 58.0 / max(1.0, speed_kph))


def _service_minutes(demand: Demand, load: float) -> float:
    if demand.kind == "deliver":
        return round(6.0 + load * 0.16, 2)
    if demand.kind == "evacuate":
        return round(8.0 + load / 85.0, 2)
    if demand.kind == "treat":
        return round(10.0 + load * 0.22, 2)
    if demand.kind == "survey":
        return round(12.0 + load * 4.0, 2)
    return round(18.0 + load, 2)


def _secondary_route(
    world: World,
    demand: Demand,
    *,
    closed_edges: set[str],
    travel_factor: float,
    visibility_factor: float,
    speed_penalty: float,
) -> tuple[float, list[str], bool]:
    if demand.kind not in ("evacuate", "treat") or not demand.destination_facility_id:
        return 0.0, [], True
    facility = next((f for f in world.facilities if f.id == demand.destination_facility_id), None)
    if facility is None:
        return 0.0, [], False
    secondary = route(
        world,
        demand.node_id,
        facility.node_id,
        closed_edges=closed_edges,
        travel_factor=travel_factor,
        visibility_factor=visibility_factor,
    )
    if not secondary.reachable:
        return 0.0, [], False
    return round(secondary.travel_min * speed_penalty, 2), secondary.edge_ids, True


def _candidate(
    world: World,
    demand: Demand,
    asset,
    *,
    origin_node_id: str,
    start: float,
    closed_edges: set[str],
    travel_factor: float,
    visibility_factor: float,
) -> _Candidate | None:
    primary = route(
        world,
        origin_node_id,
        demand.node_id,
        closed_edges=closed_edges,
        travel_factor=travel_factor,
        visibility_factor=visibility_factor,
    )
    if not primary.reachable:
        return None
    speed_penalty = _asset_speed_penalty(asset.speed_kph)
    travel = round(primary.travel_min * speed_penalty, 2)
    load = min(asset.capacity, demand.quantity)
    service = _service_minutes(demand, load)
    destination_node = demand.node_id
    if demand.destination_facility_id:
        facility = next(
            (f for f in world.facilities if f.id == demand.destination_facility_id), None
        )
        if facility is not None:
            destination_node = facility.node_id
    secondary, _, secondary_ok = _secondary_route(
        world,
        demand,
        closed_edges=closed_edges,
        travel_factor=travel_factor,
        visibility_factor=visibility_factor,
        speed_penalty=speed_penalty,
    )
    if not secondary_ok:
        return None
    end = round(start + travel + service + secondary, 2)
    end_node = destination_node if demand.kind in ("evacuate", "treat") else demand.node_id
    return _Candidate(
        asset_id=asset.id,
        origin_node_id=origin_node_id,
        end_node_id=end_node,
        route=primary,
        start=start,
        travel=travel,
        service=service,
        secondary=secondary,
        end=end,
        load=load,
        destination_facility_id=demand.destination_facility_id,
    )


def _first_pass(
    world: World,
    scenario: ScenarioConfig,
    revision: int,
) -> AllocationProposal:
    factor = weather_factor(scenario)
    visibility = 1.0 + max(0.0, (8.0 - scenario.weather.visibility_km) / 12.0)
    assets = world.assets
    assignments: list[Assignment] = []
    unassigned: list[UnassignedDemand] = []
    ordered = sorted(
        world.demands, key=lambda d: (-d.priority, d.window_end_min, -d.quantity, d.id)
    )
    for demand in ordered:
        capable = [
            asset
            for asset in assets
            if asset.capability == demand.required_capability
            and asset.available_from_min <= demand.window_end_min
        ]
        if not capable:
            unassigned.append(
                UnassignedDemand(
                    demand_id=demand.id,
                    reason=f"no asset with {demand.required_capability} capability",
                    priority=demand.priority,
                )
            )
            continue
        candidates: list[_Candidate] = []
        for asset in capable:
            start = max(float(demand.window_start_min), float(asset.available_from_min))
            candidate = _candidate(
                world,
                demand,
                asset,
                origin_node_id=asset.home_node_id,
                start=start,
                closed_edges=set(),
                travel_factor=factor,
                visibility_factor=visibility,
            )
            if candidate is not None:
                candidates.append(candidate)
        if not candidates:
            unassigned.append(
                UnassignedDemand(
                    demand_id=demand.id,
                    reason="no static route to the demand node",
                    priority=demand.priority,
                )
            )
            continue
        # Intentionally optimistic: choose the independently best asset and do
        # not reserve its calendar. The verifier is responsible for catching
        # double booking. This makes the first pass a genuine policy heuristic,
        # not a fake failure injected by the UI.
        best = min(
            candidates,
            key=lambda c: (
                c.end,
                0 if c.load >= demand.quantity else 1,
                c.asset_id,
            ),
        )
        assignments.append(
            Assignment(
                id=f"ASG-{demand.id}-{best.asset_id}",
                demand_id=demand.id,
                asset_id=best.asset_id,
                origin_node_id=best.origin_node_id,
                target_node_id=demand.node_id,
                route_edge_ids=best.route.edge_ids,
                start_min=best.start,
                travel_min=best.travel,
                service_min=best.service,
                end_min=best.end,
                load=round(best.load, 1),
                status="proposed",
                rationale=(
                    "Independent best-fit: nearest capable asset by optimistic static ETA; "
                    "calendar and hazard closures are deferred to preflight."
                ),
                destination_facility_id=best.destination_facility_id,
                route_source="static",
            )
        )
    proposal = AllocationProposal(
        id=f"PROP-{scenario.seed}-r{revision}",
        assignments=assignments,
        unassigned=unassigned,
        assumptions=[
            "Assets are treated as independently available during the optimistic first pass.",
            "Static route times ignore forecast closures; the preflight critic checks the gaps.",
            "Demand quantities are served in a single sortie up to asset capacity.",
        ],
        policy_version=ALGORITHM_VERSION,
        mode="deterministic",
        revision=revision,
    )
    return proposal.with_hash()


def _intervals_overlap(a_start: float, a_end: float, b_start: float, b_end: float) -> bool:
    return a_start < b_end - 0.01 and b_start < a_end - 0.01


def _free_start(
    intervals: list[tuple[float, float]],
    earliest: float,
    duration: float,
    latest: float,
) -> float | None:
    cursor = earliest
    for start, end in sorted(intervals):
        if cursor + duration <= start:
            return cursor if cursor <= latest else None
        cursor = max(cursor, end)
    return cursor if cursor <= latest else None


def plan_valid(
    world: World,
    scenario: ScenarioConfig,
    *,
    closed_edges: set[str],
    travel_factor: float,
    visibility_factor: float,
    revision: int,
    reason: str,
) -> AllocationProposal:
    """Build a capacity- and route-aware plan with a deterministic greedy ledger."""

    asset_intervals: dict[str, list[tuple[float, float]]] = {asset.id: [] for asset in world.assets}
    asset_locations: dict[str, str] = {asset.id: asset.home_node_id for asset in world.assets}
    shelter_load: dict[str, float] = {}
    assignments: list[Assignment] = []
    unassigned: list[UnassignedDemand] = []
    ordered = sorted(
        world.demands, key=lambda d: (-d.priority, d.window_end_min, -d.quantity, d.id)
    )

    for demand in ordered:
        capable = [
            asset
            for asset in world.assets
            if asset.capability == demand.required_capability
            and asset.available_from_min < demand.window_end_min
        ]
        if not capable:
            unassigned.append(
                UnassignedDemand(
                    demand_id=demand.id,
                    reason=f"no asset with {demand.required_capability} capability",
                    priority=demand.priority,
                )
            )
            continue
        options: list[_Candidate] = []
        for asset in capable:
            base = _candidate(
                world,
                demand,
                asset,
                origin_node_id=asset_locations[asset.id],
                start=max(float(demand.window_start_min), float(asset.available_from_min)),
                closed_edges=closed_edges,
                travel_factor=travel_factor,
                visibility_factor=visibility_factor,
            )
            if base is None:
                continue
            duration = base.travel + base.service + base.secondary
            start = _free_start(
                asset_intervals[asset.id],
                max(float(demand.window_start_min), float(asset.available_from_min)),
                duration,
                min(float(demand.window_end_min), float(asset.available_until_min)) - duration,
            )
            if start is None:
                continue
            candidate = _candidate(
                world,
                demand,
                asset,
                origin_node_id=asset_locations[asset.id],
                start=start,
                closed_edges=closed_edges,
                travel_factor=travel_factor,
                visibility_factor=visibility_factor,
            )
            if candidate is None:
                continue
            if demand.kind == "evacuate" and demand.destination_facility_id:
                shelter = next(
                    (f for f in world.facilities if f.id == demand.destination_facility_id),
                    None,
                )
                if shelter is not None:
                    used = shelter_load.get(shelter.id, 0.0)
                    if used + candidate.load > shelter.capacity:
                        continue
            options.append(candidate)
        if not options:
            unassigned.append(
                UnassignedDemand(
                    demand_id=demand.id,
                    reason=(
                        "no feasible asset with an open route, available calendar slot, "
                        "and sufficient destination capacity"
                    ),
                    priority=demand.priority,
                )
            )
            continue
        best = min(
            options,
            key=lambda c: (
                c.end,
                0 if c.load >= demand.quantity else 1,
                c.asset_id,
            ),
        )
        asset = next(a for a in world.assets if a.id == best.asset_id)
        intervals = asset_intervals[asset.id]
        if any(_intervals_overlap(best.start, best.end, start, end) for start, end in intervals):
            # Defensive: _free_start should already prevent this.
            unassigned.append(
                UnassignedDemand(
                    demand_id=demand.id,
                    reason="calendar overlap after route repair",
                    priority=demand.priority,
                )
            )
            continue
        intervals.append((best.start, best.end))
        asset_locations[asset.id] = best.end_node_id
        if demand.kind == "evacuate" and best.destination_facility_id:
            shelter_load[best.destination_facility_id] = (
                shelter_load.get(best.destination_facility_id, 0.0) + best.load
            )
        assignments.append(
            Assignment(
                id=f"ASG-{demand.id}-{best.asset_id}",
                demand_id=demand.id,
                asset_id=best.asset_id,
                origin_node_id=best.origin_node_id,
                target_node_id=demand.node_id,
                route_edge_ids=best.route.edge_ids,
                start_min=best.start,
                travel_min=best.travel,
                service_min=best.service,
                end_min=best.end,
                load=round(best.load, 1),
                status="validated",
                rationale=(
                    "Validated repair: hazard-aware route, single-booking calendar, "
                    "capability and destination capacity checked."
                ),
                destination_facility_id=best.destination_facility_id,
                route_source="repaired",
            )
        )
    proposal = AllocationProposal(
        id=f"PROP-{scenario.seed}-r{revision}",
        assignments=assignments,
        unassigned=unassigned,
        assumptions=[
            f"Repair policy: {reason}",
            f"Routes use closures projected at T+{planning_horizon_min(scenario)}.",
            "Each asset is reserved for the full travel, service, and secondary leg.",
        ],
        policy_version=ALGORITHM_VERSION,
        mode="deterministic",
        revision=revision,
    )
    return proposal.with_hash()


def first_pass(
    world: World,
    scenario: ScenarioConfig,
    conditions: ConditionsReport | None = None,
) -> AllocationProposal:
    del conditions  # resources intentionally do not see the parallel conditions branch
    return _first_pass(world, scenario, revision=0)


def repair_pass(
    world: World,
    scenario: ScenarioConfig,
    conditions: ConditionsReport,
    closed_edges: set[str],
    *,
    revision: int,
    reason: str,
) -> AllocationProposal:
    return plan_valid(
        world,
        scenario,
        closed_edges=closed_edges,
        travel_factor=conditions.travel_factor,
        visibility_factor=conditions.visibility_factor,
        revision=revision,
        reason=reason,
    )


def assignment_delta(
    before: AllocationProposal, after: AllocationProposal
) -> tuple[list[str], int, int]:
    before_by_demand = {a.demand_id: a for a in before.assignments}
    after_by_demand = {a.demand_id: a for a in after.assignments}
    changes: list[str] = []
    changed = 0
    for demand_id in sorted(set(before_by_demand) | set(after_by_demand)):
        old = before_by_demand.get(demand_id)
        new = after_by_demand.get(demand_id)
        if old is None:
            changes.append(f"Added {demand_id} → {new.asset_id if new else 'unassigned'}")
            changed += 1
        elif new is None:
            changes.append(f"Deferred {demand_id} (was {old.asset_id})")
            changed += 1
        elif old.asset_id != new.asset_id or abs(old.start_min - new.start_min) > 0.1:
            changes.append(
                f"Reassigned {demand_id}: {old.asset_id} T+{old.start_min:.0f} → "
                f"{new.asset_id} T+{new.start_min:.0f}"
            )
            changed += 1
    deferred = len(after.unassigned)
    return changes, changed, deferred
