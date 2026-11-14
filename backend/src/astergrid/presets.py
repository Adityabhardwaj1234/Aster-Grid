from __future__ import annotations

from .models import PresetInfo, ScenarioConfig

PRESETS: list[PresetInfo] = [
    PresetInfo(
        id="riverbend",
        name="Riverbend Delta",
        tagline="Flood response under a rising tide",
        scenario_type="flood",
        world_preset="riverbend",
        description=(
            "A synthetic delta city where rainfall drives a slow-moving flood. "
            "Three river crossings close in sequence. The default plan intentionally "
            "tests whether optimistic dispatch survives a real bridge closure."
        ),
        accent="#4fd8ff",
        tags=["Flood", "Evacuation", "Logistics", "River crossings"],
        scenario=ScenarioConfig(
            name="Riverbend Delta Flood",
            scenario_type="flood",
            world_preset="riverbend",
            seed=1847,
            duration_minutes=360,
            start_hour=6,
            disruption_level=0.55,
            affected_district_ids=["D-0", "D-1", "D-3", "D-5"],
            weather={
                "rainfall_mm_h": 28,
                "wind_kph": 24,
                "wind_dir_deg": 225,
                "visibility_km": 5.5,
                "terrain_saturation": 0.7,
            },
            resources={
                "rescue_teams": 4,
                "medical_units": 2,
                "supply_vehicles": 4,
                "survey_drones": 2,
            },
            objectives={
                "coverage": 0.4,
                "delivery": 0.28,
                "response_time": 0.22,
                "survey": 0.1,
            },
        ),
    ),
    PresetInfo(
        id="cedar_ridge",
        name="Cedar Ridge",
        tagline="Wind-driven evacuation on a dry ridge",
        scenario_type="wildfire",
        world_preset="cedar_ridge",
        description=(
            "A fictional ridge community under a fast-moving wildfire perimeter. "
            "Smoke reduces visibility and wind pushes the hazard across the eastern roads."
        ),
        accent="#ff9b4a",
        tags=["Wildfire", "Evacuation", "Wind", "Smoke"],
        scenario=ScenarioConfig(
            name="Cedar Ridge Evacuation",
            scenario_type="wildfire",
            world_preset="cedar_ridge",
            seed=2711,
            duration_minutes=300,
            start_hour=14,
            disruption_level=0.7,
            affected_district_ids=["D-0", "D-3", "D-5"],
            weather={
                "rainfall_mm_h": 0,
                "wind_kph": 48,
                "wind_dir_deg": 250,
                "visibility_km": 3.5,
                "terrain_saturation": 0.12,
            },
            resources={
                "rescue_teams": 5,
                "medical_units": 2,
                "supply_vehicles": 3,
                "survey_drones": 2,
            },
            objectives={
                "coverage": 0.5,
                "delivery": 0.15,
                "response_time": 0.25,
                "survey": 0.1,
            },
        ),
    ),
    PresetInfo(
        id="arclight",
        name="Arclight Junction",
        tagline="Infrastructure disruption and relay failure",
        scenario_type="infrastructure",
        world_preset="arclight",
        description=(
            "A fictional logistics junction loses a bridge and a communications relay. "
            "Supply continuity depends on a longer southern detour and a repair-kit delivery."
        ),
        accent="#b49bff",
        tags=["Infrastructure", "Bridge", "Comms", "Supply"],
        scenario=ScenarioConfig(
            name="Arclight Relay Disruption",
            scenario_type="infrastructure",
            world_preset="arclight",
            seed=9042,
            duration_minutes=300,
            start_hour=9,
            disruption_level=0.75,
            affected_district_ids=["D-1", "D-2", "D-3"],
            weather={
                "rainfall_mm_h": 8,
                "wind_kph": 12,
                "wind_dir_deg": 180,
                "visibility_km": 10,
                "terrain_saturation": 0.35,
            },
            resources={
                "rescue_teams": 2,
                "medical_units": 2,
                "supply_vehicles": 5,
                "survey_drones": 3,
            },
            objectives={
                "coverage": 0.25,
                "delivery": 0.35,
                "response_time": 0.15,
                "survey": 0.25,
            },
        ),
    ),
    PresetInfo(
        id="meridian",
        name="Meridian Basin",
        tagline="Survey a fractured basin before the window closes",
        scenario_type="exploration",
        world_preset="meridian",
        description=(
            "A fictional highland basin survey. Drone coverage, terrain difficulty, and a "
            "short daylight window shape a calm but resource-constrained mission."
        ),
        accent="#5ef2b2",
        tags=["Exploration", "Survey", "Terrain", "Coverage"],
        scenario=ScenarioConfig(
            name="Meridian Basin Survey",
            scenario_type="exploration",
            world_preset="meridian",
            seed=5150,
            duration_minutes=420,
            start_hour=7,
            disruption_level=0.2,
            affected_district_ids=["D-0", "D-2", "D-3", "D-5"],
            weather={
                "rainfall_mm_h": 0,
                "wind_kph": 14,
                "wind_dir_deg": 120,
                "visibility_km": 16,
                "terrain_saturation": 0.2,
            },
            resources={
                "rescue_teams": 1,
                "medical_units": 1,
                "supply_vehicles": 2,
                "survey_drones": 6,
            },
            objectives={
                "coverage": 0.15,
                "delivery": 0.1,
                "response_time": 0.1,
                "survey": 0.65,
            },
        ),
    ),
]


def preset_by_id(preset_id: str) -> PresetInfo:
    for preset in PRESETS:
        if preset.id == preset_id:
            return preset
    raise KeyError(f"unknown preset: {preset_id}")


def default_scenario() -> ScenarioConfig:
    return PRESETS[0].scenario.model_copy(deep=True)
