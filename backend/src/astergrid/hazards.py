from __future__ import annotations

import math

from .models import HazardState, RoadEdge, RoadState, ScenarioConfig, World


def planning_horizon_min(scenario: ScenarioConfig) -> int:
    if scenario.scenario_type == "flood":
        return 120
    if scenario.scenario_type == "wildfire":
        return 120
    if scenario.scenario_type == "infrastructure":
        return 90
    return 60


def water_level_m(world: World, scenario: ScenarioConfig, t_min: float) -> float:
    if scenario.scenario_type != "flood":
        return 0.0
    base = world.hazard.base_level_m
    peak = world.hazard.peak_level_m
    progress = min(1.0, max(0.0, t_min) / 240.0) ** 0.55
    return round(base + (peak - base) * progress, 2)


def fire_radius_km(world: World, scenario: ScenarioConfig, t_min: float) -> float:
    if scenario.scenario_type != "wildfire":
        return 0.0
    growth = (max(0.0, t_min) / 60.0) ** 0.8
    radius = 0.18 + (scenario.weather.wind_kph / 30.0) * growth
    return round(min(world.hazard.fire_radius_peak_km, radius), 2)


def fire_center(world: World, scenario: ScenarioConfig, t_min: float) -> tuple[float, float]:
    cx, cz = world.hazard.fire_center
    radius_m = fire_radius_km(world, scenario, t_min) * 1000.0
    wind = math.radians(scenario.weather.wind_dir_deg)
    # The perimeter drifts downwind as it grows.
    return (
        cx + math.cos(wind) * radius_m * 0.18,
        cz + math.sin(wind) * radius_m * 0.18,
    )


def _edge_midpoint(edge: RoadEdge) -> tuple[float, float]:
    if len(edge.polyline) >= 3:
        return edge.polyline[1]
    return (
        (edge.polyline[0][0] + edge.polyline[-1][0]) / 2.0,
        (edge.polyline[0][1] + edge.polyline[-1][1]) / 2.0,
    )


def closed_edge_ids(
    world: World,
    scenario: ScenarioConfig,
    t_min: float,
    *,
    repaired_edges: set[str] | None = None,
) -> set[str]:
    repaired = repaired_edges or set()
    closed: set[str] = set()
    if scenario.scenario_type == "flood":
        water = water_level_m(world, scenario, t_min)
        for edge in world.edges:
            if edge.id in repaired:
                continue
            if (
                edge.bridge
                and edge.clearance_m is not None
                and edge.clearance_m <= water + 0.05
                or not edge.bridge
                and edge.low_point_m <= water + 0.2
            ):
                closed.add(edge.id)
    elif scenario.scenario_type == "wildfire":
        radius_m = fire_radius_km(world, scenario, t_min) * 1000.0
        center = fire_center(world, scenario, t_min)
        for edge in world.edges:
            m = _edge_midpoint(edge)
            if math.hypot(m[0] - center[0], m[1] - center[1]) <= radius_m:
                closed.add(edge.id)
    elif scenario.scenario_type == "infrastructure":
        if "B-2" not in repaired:
            closed.add("B-2")
        if t_min >= 45 and "B-1" not in repaired:
            closed.add("B-1")
        if scenario.disruption_level > 0.85 and t_min >= 120 and "B-3" not in repaired:
            closed.add("B-3")
    return closed


def road_states(
    world: World,
    scenario: ScenarioConfig,
    t_min: float,
    *,
    repaired_edges: set[str] | None = None,
) -> list[RoadState]:
    closed = closed_edge_ids(world, scenario, t_min, repaired_edges=repaired_edges)
    states: list[RoadState] = []
    for edge in world.edges:
        if edge.id in closed:
            if scenario.scenario_type == "flood" and edge.bridge:
                reason = "bridge clearance exceeded"
            elif scenario.scenario_type == "wildfire":
                reason = "inside fire perimeter"
            elif scenario.scenario_type == "infrastructure":
                reason = "structural or relay disruption"
            else:
                reason = "hazard closure"
            states.append(RoadState(edge_id=edge.id, status="closed", reason=reason))
        elif edge.bridge and scenario.scenario_type == "flood":
            states.append(RoadState(edge_id=edge.id, status="degraded", reason="flood watch"))
        else:
            states.append(RoadState(edge_id=edge.id, status="open"))
    return states


def hazard_state(world: World, scenario: ScenarioConfig, t_min: float) -> HazardState:
    if scenario.scenario_type == "flood":
        water = water_level_m(world, scenario, t_min)
        summary = f"River stage {water:.2f} m · rainfall {scenario.weather.rainfall_mm_h:.0f} mm/h"
    elif scenario.scenario_type == "wildfire":
        radius = fire_radius_km(world, scenario, t_min)
        summary = f"Fire perimeter {radius:.2f} km · wind {scenario.weather.wind_kph:.0f} km/h"
    elif scenario.scenario_type == "infrastructure":
        closed = closed_edge_ids(world, scenario, t_min)
        summary = f"{len(closed)} crossing(s) unavailable · relay degradation"
    else:
        summary = f"Survey window · visibility {scenario.weather.visibility_km:.0f} km"
    return HazardState(
        water_level_m=water_level_m(world, scenario, t_min),
        fire_radius_km=fire_radius_km(world, scenario, t_min),
        wind_kph=scenario.weather.wind_kph,
        visibility_km=scenario.weather.visibility_km,
        summary=summary,
    )


def conditions_summary(
    world: World, scenario: ScenarioConfig
) -> tuple[float, float, float, float, list[str], list[str]]:
    """Return travel factor, visibility factor, water, fire radius, closed ids, notes."""

    horizon = planning_horizon_min(scenario)
    rainfall_factor = scenario.weather.rainfall_mm_h / 95.0
    wind_factor = scenario.weather.wind_kph / 170.0
    travel_factor = round(1.0 + rainfall_factor + wind_factor, 3)
    visibility_factor = round(1.0 + max(0.0, (8.0 - scenario.weather.visibility_km) / 10.0), 3)
    water = water_level_m(world, scenario, horizon)
    fire = fire_radius_km(world, scenario, horizon)
    closed = sorted(closed_edge_ids(world, scenario, horizon))
    notes: list[str] = []
    if scenario.scenario_type == "flood":
        notes.append(f"River stage is projected to reach {water:.2f} m by T+{horizon}.")
        notes.append("Low bridges are screened against projected clearance, not current state.")
    elif scenario.scenario_type == "wildfire":
        notes.append(f"Perimeter is projected to reach {fire:.2f} km by T+{horizon}.")
        notes.append("Wind-aligned roads are treated as high risk even before closure.")
    elif scenario.scenario_type == "infrastructure":
        notes.append("The middle crossing is unavailable; the north crossing closes at T+45.")
    else:
        notes.append("No road closures dominate; battery and daylight windows do.")
    return travel_factor, visibility_factor, water, fire, closed, notes
