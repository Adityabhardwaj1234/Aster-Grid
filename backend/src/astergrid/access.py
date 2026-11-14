from __future__ import annotations

from .hazards import conditions_summary
from .models import AccessReport, AccessRoute, ScenarioConfig, World
from .routing import route, static_route


def build_access_report(world: World, scenario: ScenarioConfig) -> AccessReport:
    travel, visibility, _water, _fire, closed, notes = conditions_summary(world, scenario)
    closed_set = set(closed)
    facilities = {f.id: f for f in world.facilities}
    routes: list[AccessRoute] = []
    unreachable: list[str] = []
    for demand in world.demands:
        target = (
            facilities[demand.destination_facility_id].node_id
            if demand.destination_facility_id in facilities
            else demand.node_id
        )
        result = route(
            world,
            demand.node_id,
            target,
            closed_edges=closed_set,
            travel_factor=travel,
            visibility_factor=visibility,
        )
        blocked: list[str] = []
        if not result.reachable:
            unreachable.append(demand.id)
            optimistic = static_route(world, demand.node_id, target, travel)
            blocked = [edge_id for edge_id in optimistic.edge_ids if edge_id in closed_set]
        routes.append(
            AccessRoute(
                demand_id=demand.id,
                origin_node_id=demand.node_id,
                target_node_id=target,
                edge_ids=result.edge_ids,
                travel_min=result.travel_min,
                reachable=result.reachable,
                blocked_edge_ids=blocked,
            )
        )
    report = AccessReport(
        summary=(
            f"Accessibility checked {len(routes)} demand destinations at the planning horizon; "
            f"{len(unreachable)} unreachable and {len(closed)} projected closure(s)."
        ),
        routes=routes,
        unreachable_demand_ids=unreachable,
        closed_edge_ids=closed,
        planning_horizon_min=(
            120
            if scenario.scenario_type in ("flood", "wildfire")
            else 90
            if scenario.scenario_type == "infrastructure"
            else 60
        ),
        assumptions=[
            "Routes are evaluated against projected hazard closures, not the live map.",
            "A reachable demand destination does not reserve an asset or guarantee its origin is reachable.",
            *notes,
        ],
        mode="deterministic",
    )
    return report.with_hash()
