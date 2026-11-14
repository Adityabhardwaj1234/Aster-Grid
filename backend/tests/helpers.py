from __future__ import annotations

from astergrid.hazards import conditions_summary, planning_horizon_min
from astergrid.models import AccessReport, ConditionsReport, ScenarioConfig, World
from astergrid.worldgen import generate_world


def make_conditions(world: World, scenario: ScenarioConfig) -> ConditionsReport:
    travel, visibility, water, fire, closed, notes = conditions_summary(world, scenario)
    horizon = planning_horizon_min(scenario)
    return ConditionsReport(
        summary=(
            f"{scenario.scenario_type.title()} projections at T+{horizon}; "
            f"{len(closed)} projected closure(s)."
        ),
        assumptions=[
            "Weather is synthetic and fixed by the scenario seed.",
            *notes,
        ],
        travel_factor=travel,
        visibility_factor=visibility,
        planning_horizon_min=horizon,
        water_level_at_horizon_m=water,
        fire_radius_at_horizon_km=fire,
        closed_edge_ids=closed,
        risk_notes=notes,
        mode="deterministic",
    )


def prepare_domain(scenario: ScenarioConfig) -> tuple[World, ConditionsReport, AccessReport]:
    world = generate_world(scenario)
    conditions = make_conditions(world, scenario)
    from astergrid.access import build_access_report

    access = build_access_report(world, scenario)
    return world, conditions, access
