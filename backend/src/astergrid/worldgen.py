from __future__ import annotations

import base64
import math
from collections.abc import Iterable

import numpy as np

from .models import (
    AssetSpec,
    Demand,
    District,
    Facility,
    HazardProfile,
    RiskGrid,
    River,
    RoadEdge,
    RoadNode,
    ScenarioConfig,
    TerrainData,
    World,
    canonical_hash,
)

ALGORITHM_VERSION = "worldgen-1.0"
MAP_SIZE = 8000.0
GRID = 96
ROAD_ROWS = 5
ROAD_COLS = 5


PRESET_NAMES: dict[str, dict[str, object]] = {
    "riverbend": {
        "title": "Riverbend Delta",
        "districts": [
            "Northbank",
            "Lantern Row",
            "Market Reach",
            "Southbank",
            "Kestrel Point",
            "Cedar Flats",
        ],
        "facilities": {
            "F-S1": "Lantern Civic Shelter",
            "F-S2": "Southbank Assembly Hall",
            "F-S3": "Kestrel Point Shelter",
            "F-S4": "Northbank Gymnasium",
            "F-H1": "St. Orra Hospital",
            "F-H2": "Morrow Field Clinic",
            "F-D1": "Delta Supply Depot",
            "F-D2": "East Reach Depot",
            "F-D3": "Central Cache",
            "F-C1": "Relay North",
            "F-C2": "Relay South",
            "F-CMD": "Riverbend Command Post",
        },
    },
    "cedar_ridge": {
        "title": "Cedar Ridge",
        "districts": ["Pine Hollow", "Cedar Ridge", "Ashfall", "Ridgeway", "Clearwater", "Basin"],
        "facilities": {
            "F-S1": "Pine Hollow Shelter",
            "F-S2": "Clearwater Hall",
            "F-S3": "Basin School Shelter",
            "F-S4": "Ridgeway Gymnasium",
            "F-H1": "Cedar Field Hospital",
            "F-H2": "Ashfall Clinic",
            "F-D1": "Ridge Supply Depot",
            "F-D2": "Clearwater Depot",
            "F-D3": "Basin Cache",
            "F-C1": "Relay Ridge",
            "F-C2": "Relay Basin",
            "F-CMD": "Cedar Ridge Command",
        },
    },
    "arclight": {
        "title": "Arclight Junction",
        "districts": ["Foundry", "Arclight", "Relay Row", "Eastgate", "Morrow", "Depot Basin"],
        "facilities": {
            "F-S1": "Foundry Shelter",
            "F-S2": "Eastgate Assembly",
            "F-S3": "Depot Basin Shelter",
            "F-S4": "Morrow Gymnasium",
            "F-H1": "Arclight General",
            "F-H2": "Eastgate Clinic",
            "F-D1": "Arclight Depot",
            "F-D2": "Eastgate Stores",
            "F-D3": "Morrow Cache",
            "F-C1": "Relay North",
            "F-C2": "Relay South",
            "F-CMD": "Arclight Command",
        },
    },
    "meridian": {
        "title": "Meridian Basin",
        "districts": ["Highline", "Meridian", "Canyon", "Salt Flats", "Survey East", "Outpost"],
        "facilities": {
            "F-S1": "Highline Shelter",
            "F-S2": "Survey East Hall",
            "F-S3": "Outpost Shelter",
            "F-S4": "Meridian Gymnasium",
            "F-H1": "Meridian Field Clinic",
            "F-H2": "Canyon Clinic",
            "F-D1": "Highline Depot",
            "F-D2": "Outpost Stores",
            "F-D3": "Meridian Cache",
            "F-C1": "Relay Highline",
            "F-C2": "Relay Outpost",
            "F-CMD": "Meridian Survey Command",
        },
    },
}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _river_x(z: float, size: float = MAP_SIZE, seed: int = 1847) -> float:
    phase = (seed % 997) / 997.0 * math.tau
    return (
        size * 0.48
        + 210.0 * math.sin(z / size * math.tau * 1.25 + phase)
        + 82.0 * math.sin(z / size * math.tau * 3.1 + phase * 0.7)
    )


def _value_noise(n: int, rng: np.random.Generator, octaves: int = 4, base: int = 4) -> np.ndarray:
    out = np.zeros((n, n), dtype=np.float64)
    total = 0.0
    amp = 1.0
    axis = np.linspace(0, 1, n)
    for octave in range(octaves):
        g = base * (2**octave) + 1
        grid = rng.random((g, g))
        source = np.linspace(0, 1, g)
        # Interpolate rows first, then columns. This is deterministic and avoids
        # a SciPy dependency for a single small heightmap.
        rows = np.empty((g, n), dtype=np.float64)
        for i in range(g):
            rows[i] = np.interp(axis, source, grid[i])
        cols = np.empty((n, n), dtype=np.float64)
        for j in range(n):
            cols[:, j] = np.interp(axis, source, rows[:, j])
        out += cols * amp
        total += amp
        amp *= 0.5
    return out / total


def _sample_height(heights: np.ndarray, x: float, z: float, size: float = MAP_SIZE) -> float:
    n = heights.shape[0]
    fx = _clamp(x / size * (n - 1), 0, n - 1)
    fz = _clamp(z / size * (n - 1), 0, n - 1)
    x0 = int(fx)
    z0 = int(fz)
    x1 = min(n - 1, x0 + 1)
    z1 = min(n - 1, z0 + 1)
    tx = fx - x0
    tz = fz - z0
    a = heights[z0, x0] * (1 - tx) + heights[z0, x1] * tx
    b = heights[z1, x0] * (1 - tx) + heights[z1, x1] * tx
    return float(a * (1 - tz) + b * tz)


def _point_in_polygon(x: float, z: float, polygon: list[tuple[float, float]]) -> bool:
    inside = False
    j = len(polygon) - 1
    for i, (xi, zi) in enumerate(polygon):
        xj, zj = polygon[j]
        if ((zi > z) != (zj > z)) and (x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def _polygon_centroid(polygon: list[tuple[float, float]]) -> tuple[float, float]:
    return (
        sum(p[0] for p in polygon) / len(polygon),
        sum(p[1] for p in polygon) / len(polygon),
    )


def _vertical_boundary(index: int, z: float, size: float, seed: int) -> float:
    if index == 0:
        return 0.0
    if index == 3:
        return size
    base = size * (0.33 if index == 1 else 0.67)
    phase = (seed % 113) / 113.0 * math.tau
    wobble = 112.0 * math.sin(z / size * math.tau * 1.6 + phase) + 46.0 * math.sin(
        z / size * math.tau * 3.3 + phase * 0.5
    )
    return base + wobble


def _make_districts(
    scenario: ScenarioConfig,
    heights: np.ndarray,
    size: float,
    rng: np.random.Generator,
) -> list[District]:
    names = PRESET_NAMES[scenario.world_preset]["districts"]
    assert isinstance(names, list)
    zs = [0.0, size * 0.5, size]
    districts: list[District] = []
    for row in range(2):
        for col in range(3):
            left: list[tuple[float, float]] = []
            right: list[tuple[float, float]] = []
            for z in np.linspace(zs[row], zs[row + 1], 5):
                left.append((_vertical_boundary(col, float(z), size, scenario.seed), float(z)))
                right.append((_vertical_boundary(col + 1, float(z), size, scenario.seed), float(z)))
            polygon = (
                [(left[0][0], zs[row])]
                + [(right[0][0], zs[row])]
                + right[1:]
                + list(reversed(left[1:]))
            )
            # Remove a duplicate corner if the wavy boundary happens to align.
            deduped: list[tuple[float, float]] = []
            for point in polygon:
                if not deduped or (
                    abs(point[0] - deduped[-1][0]) > 0.01 or abs(point[1] - deduped[-1][1]) > 0.01
                ):
                    deduped.append(point)
            cx, cz = _polygon_centroid(deduped)
            district_id = f"D-{row * 3 + col}"
            samples: list[float] = []
            for sx in np.linspace(min(p[0] for p in deduped), max(p[0] for p in deduped), 10):
                for sz in np.linspace(zs[row] + 20, zs[row + 1] - 20, 10):
                    if _point_in_polygon(float(sx), float(sz), deduped):
                        samples.append(_sample_height(heights, float(sx), float(sz), size))
            elevation = (
                float(np.mean(samples)) if samples else _sample_height(heights, cx, cz, size)
            )
            river_distance = abs(cx - _river_x(cz, size, scenario.seed))
            if scenario.scenario_type == "flood":
                risk = _clamp(
                    0.12
                    + 0.65 * math.exp(-river_distance / 1900.0)
                    + 0.2 * (1.0 - _clamp(elevation / 70.0, 0.0, 1.0)),
                    0.05,
                    0.98,
                )
            elif scenario.scenario_type == "wildfire":
                fire = (size * 0.71, size * 0.29)
                distance = math.hypot(cx - fire[0], cz - fire[1])
                risk = _clamp(0.12 + 0.78 * math.exp(-distance / 2600.0) + 0.08, 0.05, 0.98)
            elif scenario.scenario_type == "infrastructure":
                risk = _clamp(0.2 + 0.5 * math.exp(-river_distance / 2600.0) + 0.12, 0.05, 0.95)
            else:
                risk = _clamp(
                    0.18 + 0.5 * (elevation / 160.0) + float(rng.random()) * 0.08, 0.05, 0.92
                )
            population = int(
                rng.integers(5200, 13800)
                + (3200 if 0.28 < cx / size < 0.75 and 0.2 < cz / size < 0.82 else 0)
            )
            districts.append(
                District(
                    id=district_id,
                    name=str(names[row * 3 + col]),
                    polygon=[(round(p[0], 2), round(p[1], 2)) for p in deduped],
                    centroid=(round(cx, 2), round(cz, 2)),
                    population=population,
                    risk_base=round(risk, 3),
                    tag=(
                        "river-lowland"
                        if scenario.scenario_type == "flood" and river_distance < 2000
                        else "wildland-interface"
                        if scenario.scenario_type == "wildfire" and risk > 0.55
                        else "urban"
                    ),
                    elevation_m=round(elevation, 1),
                )
            )
    return districts


def _make_nodes(
    districts: list[District], heights: np.ndarray, size: float, rng: np.random.Generator
) -> list[RoadNode]:
    xs = [700.0, 2100.0, 3650.0, 4550.0, 7200.0]
    zs = [760.0, 2320.0, 4000.0, 5680.0, 7240.0]
    nodes: list[RoadNode] = []
    for row in range(ROAD_ROWS):
        for col in range(ROAD_COLS):
            x = _clamp(xs[col] + float(rng.integers(-150, 151)), 120.0, size - 120.0)
            z = _clamp(zs[row] + float(rng.integers(-130, 131)), 120.0, size - 120.0)
            district_id = min(
                districts,
                key=lambda d: (d.centroid[0] - x) ** 2 + (d.centroid[1] - z) ** 2,
            ).id
            for district in districts:
                if _point_in_polygon(x, z, district.polygon):
                    district_id = district.id
                    break
            nodes.append(
                RoadNode(
                    id=f"N-{row}-{col}",
                    x=round(x, 1),
                    z=round(z, 1),
                    elevation_m=round(_sample_height(heights, x, z, size), 1),
                    district_id=district_id,
                    kind="junction",
                )
            )
    return nodes


def _node(nodes: list[RoadNode], row: int, col: int) -> RoadNode:
    return next(n for n in nodes if n.id == f"N-{row}-{col}")


def _polyline_length(points: list[tuple[float, float]]) -> float:
    return sum(
        math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1])
        for i in range(len(points) - 1)
    )


def _make_edges(
    nodes: list[RoadNode], scenario: ScenarioConfig, size: float, rng: np.random.Generator
) -> list[RoadEdge]:
    edges: list[RoadEdge] = []
    edge_by_pair: dict[tuple[str, str], RoadEdge] = {}

    def add(
        a: RoadNode,
        b: RoadNode,
        *,
        bridge: bool = False,
        row: int | None = None,
        speed: float | None = None,
        clearance: float | None = None,
    ) -> None:
        key = tuple(sorted((a.id, b.id)))
        if key in edge_by_pair:
            return
        if bridge:
            river_z = (a.z + b.z) / 2.0
            polyline = [
                (a.x, a.z),
                (round(_river_x(river_z, size, scenario.seed), 1), round(river_z, 1)),
                (b.x, b.z),
            ]
            edge_id = f"B-{row}"
            label = f"B-{row} · {['North', 'Middle', 'South'][(row or 1) - 1]} Crossing"
            base_speed = 31.0 if row == 3 else 37.0
            capacity = 46 if row == 3 else 72
            low = 1.2
        else:
            polyline = [(a.x, a.z), (b.x, b.z)]
            edge_id = f"E-{a.id[2:]}-{b.id[2:]}"
            label = ""
            base_speed = 54.0 if abs(a.z - b.z) < 1 else 61.0
            capacity = int(rng.integers(95, 180))
            low = min(a.elevation_m, b.elevation_m) - 0.4
        length = _polyline_length(polyline)
        edges.append(
            RoadEdge(
                id=edge_id,
                a=a.id,
                b=b.id,
                polyline=polyline,
                length_m=round(length, 1),
                speed_kph=round(
                    speed if speed is not None else base_speed + float(rng.integers(-3, 5)), 2
                ),
                capacity=capacity,
                bridge=bridge,
                clearance_m=round(clearance if clearance is not None else 0.0, 2)
                if bridge
                else None,
                low_point_m=round(low, 1),
                label=label,
            )
        )
        edge_by_pair[key] = edges[-1]

    # East-west links. Only three controlled river crossings are retained.
    for row in range(ROAD_ROWS):
        for col in range(ROAD_COLS - 1):
            a = _node(nodes, row, col)
            b = _node(nodes, row, col + 1)
            if col == 2:
                if row in (1, 2, 3):
                    clearances = {1: 1.15, 2: 1.85, 3: 3.5}
                    add(a, b, bridge=True, row=row, clearance=clearances[row])
                continue
            add(a, b)

    # North-south links.
    for row in range(ROAD_ROWS - 1):
        for col in range(ROAD_COLS):
            add(_node(nodes, row, col), _node(nodes, row + 1, col))

    # A handful of diagonals keep the graph resilient without making it a mesh.
    diagonals = [
        (0, 0, 1, 1),
        (1, 0, 0, 1),
        (2, 1, 3, 2),
        (3, 1, 4, 2),
        (2, 3, 3, 4),
        (0, 3, 1, 4),
        (3, 0, 4, 1),
    ]
    for r1, c1, r2, c2 in diagonals:
        add(_node(nodes, r1, c1), _node(nodes, r2, c2))
    return edges


def _make_facilities(
    nodes: list[RoadNode],
    districts: list[District],
    scenario: ScenarioConfig,
    rng: np.random.Generator,
) -> list[Facility]:
    names = PRESET_NAMES[scenario.world_preset]["facilities"]
    assert isinstance(names, dict)
    specs = [
        ("F-S1", "shelter", (0, 1), 720, 86),
        ("F-S2", "shelter", (4, 3), 640, 74),
        ("F-S3", "shelter", (3, 4), 520, 64),
        ("F-S4", "shelter", (1, 0), 480, 58),
        ("F-H1", "hospital", (1, 1), 124, 150),
        ("F-H2", "hospital", (3, 3), 84, 96),
        ("F-D1", "depot", (2, 0), 440, 520),
        ("F-D2", "depot", (4, 1), 360, 410),
        ("F-D3", "depot", (2, 2), 320, 280),
        ("F-C1", "comms", (0, 2), 1, 1),
        ("F-C2", "comms", (4, 4), 1, 1),
        ("F-CMD", "command", (2, 1), 1, 1),
    ]
    facilities: list[Facility] = []
    for facility_id, facility_type, (row, col), capacity, stock in specs:
        node = _node(nodes, row, col)
        node.kind = "depot" if facility_type == "depot" else "facility"
        if facility_id == "F-C2" and scenario.scenario_type == "infrastructure":
            status = "closed"
        elif facility_id == "F-C1" and scenario.disruption_level > 0.7:
            status = "degraded"
        else:
            status = "open"
        facilities.append(
            Facility(
                id=facility_id,
                name=str(names[facility_id]),
                type=facility_type,
                node_id=node.id,
                district_id=node.district_id,
                capacity=capacity,
                stock=stock,
                status=status,
            )
        )
    return facilities


def _make_assets(scenario: ScenarioConfig, facilities: list[Facility]) -> list[AssetSpec]:
    config = scenario.resources
    by_id = {facility.id: facility for facility in facilities}
    groups: list[tuple[str, str, int, list[str], float, float, str]] = [
        (
            "rescue",
            "Rook",
            config.rescue_teams,
            ["F-CMD", "F-S1", "F-S4", "F-D1"],
            480.0,
            57.0,
            "rescue",
        ),
        ("medical", "Medic", config.medical_units, ["F-H1", "F-H2"], 70.0, 63.0, "medical"),
        ("supply", "Haul", config.supply_vehicles, ["F-D1", "F-D3", "F-D2"], 60.0, 53.0, "supply"),
        ("drone", "Kite", config.survey_drones, ["F-CMD", "F-C1"], 4.0, 92.0, "survey"),
    ]
    assets: list[AssetSpec] = []
    serial = 0
    for asset_type, callsign, count, bases, capacity, speed, capability in groups:
        for index in range(count):
            serial += 1
            base = by_id[bases[index % len(bases)]]
            assets.append(
                AssetSpec(
                    id=f"A-{serial:02d}",
                    callsign=f"{callsign} {index + 1}",
                    type=asset_type,
                    home_node_id=base.node_id,
                    capability=capability,
                    capacity=capacity,
                    speed_kph=speed + (index % 3) * 2,
                    available_from_min=0,
                    available_until_min=scenario.duration_minutes,
                )
            )
    return assets


def _choose_node_in_district(nodes: list[RoadNode], district: District) -> str:
    candidates = [n for n in nodes if n.district_id == district.id]
    if not candidates:
        candidates = nodes
    nearest = min(
        candidates,
        key=lambda n: (n.x - district.centroid[0]) ** 2 + (n.z - district.centroid[1]) ** 2,
    )
    return nearest.id


def _nearest_facility(
    facilities: list[Facility], nodes: list[RoadNode], district: District, facility_type: str
) -> Facility:
    node_by_id = {n.id: n for n in nodes}
    candidates = [f for f in facilities if f.type == facility_type and f.status != "closed"]
    if not candidates:
        candidates = [f for f in facilities if f.type == facility_type]
    return min(
        candidates,
        key=lambda f: (
            (node_by_id[f.node_id].x - district.centroid[0]) ** 2
            + (node_by_id[f.node_id].z - district.centroid[1]) ** 2
        ),
    )


def _make_demands(
    scenario: ScenarioConfig,
    districts: list[District],
    nodes: list[RoadNode],
    facilities: list[Facility],
    size: float,
) -> list[Demand]:
    district_by_id = {d.id: d for d in districts}
    affected_ids = scenario.affected_district_ids or [d.id for d in districts]
    unknown = [district_id for district_id in affected_ids if district_id not in district_by_id]
    if unknown:
        raise ValueError(f"unknown district ids: {', '.join(unknown)}")
    affected = [district_by_id[district_id] for district_id in affected_ids]
    shelters = [f for f in facilities if f.type == "shelter"]
    depots = [f for f in facilities if f.type == "depot"]
    demands: list[Demand] = []

    def add(**kwargs) -> None:
        demands.append(Demand(id=f"DEM-{len(demands) + 1:02d}", **kwargs))

    def deliver_tasks(count: int) -> None:
        for index in range(count):
            shelter = shelters[index % len(shelters)]
            quantity = float(24 + index * 8 + (scenario.seed % 7))
            add(
                kind="deliver",
                label=f"Supply lift to {shelter.name}",
                district_id=shelter.district_id,
                node_id=shelter.node_id,
                quantity=round(quantity, 1),
                unit="t",
                priority=4,
                required_capability="supply",
                window_start_min=0,
                window_end_min=min(scenario.duration_minutes, 170),
                destination_facility_id=shelter.id,
            )

    def medical_tasks(count: int) -> None:
        ordered = sorted(affected, key=lambda d: (-d.population, d.id))[:count]
        for index, district in enumerate(ordered):
            hospital = _nearest_facility(facilities, nodes, district, "hospital")
            add(
                kind="treat",
                label=f"Triage support · {district.name}",
                district_id=district.id,
                node_id=_choose_node_in_district(nodes, district),
                quantity=float(24 + index * 9),
                unit="patients",
                priority=5,
                required_capability="medical",
                window_start_min=min(scenario.duration_minutes - 30, index * 12),
                window_end_min=min(scenario.duration_minutes, 44 + index * 16),
                destination_facility_id=hospital.id,
            )

    def survey_tasks(count: int, start: int = 45) -> None:
        ordered = sorted(affected, key=lambda d: (-d.risk_base, d.id))[:count]
        for index, district in enumerate(ordered):
            add(
                kind="survey",
                label=f"Damage survey · {district.name}",
                district_id=district.id,
                node_id=_choose_node_in_district(nodes, district),
                quantity=2.0,
                unit="zones",
                priority=3,
                required_capability="survey",
                window_start_min=min(scenario.duration_minutes - 60, start + index * 40),
                window_end_min=min(scenario.duration_minutes, start + 150 + index * 40),
            )

    def evacuation_tasks(count: int) -> None:
        right = [d for d in affected if d.centroid[0] > size * 0.52]
        others = [d for d in affected if d not in right]
        ordered = sorted(
            [*right, *others],
            key=lambda d: (0 if d in right else 1, -d.population, d.id),
        )[:count]
        used_shelters: list[str] = []
        for index, district in enumerate(ordered):
            candidates = [
                s
                for s in shelters
                if s.id not in used_shelters
                and (s.district_id != district.id)
                and sum(1 for d in demands if d.destination_facility_id == s.id) < 1
            ]
            if scenario.scenario_type == "flood" and district.centroid[0] > size * 0.52:
                across_river = [
                    s
                    for s in candidates
                    if next(n for n in nodes if n.id == s.node_id).x < size * 0.5
                ]
                if across_river:
                    candidates = across_river
            if not candidates:
                candidates = [s for s in shelters if s.id not in used_shelters] or shelters
            shelter = min(
                candidates,
                key=lambda f: (
                    (next(n for n in nodes if n.id == f.node_id).x - district.centroid[0]) ** 2
                    + (next(n for n in nodes if n.id == f.node_id).z - district.centroid[1]) ** 2
                ),
            )
            used_shelters.append(shelter.id)
            quantity = float(min(460, max(180, int(shelter.capacity * 0.52) + index * 30)))
            add(
                kind="evacuate",
                label=f"Evacuate {district.name} → {shelter.name}",
                district_id=district.id,
                node_id=_choose_node_in_district(nodes, district),
                quantity=quantity,
                unit="persons",
                priority=5,
                required_capability="rescue",
                window_start_min=10 + index * 8,
                window_end_min=min(scenario.duration_minutes, 120 + index * 20),
                destination_facility_id=shelter.id,
            )

    if scenario.scenario_type in ("flood", "wildfire"):
        deliver_tasks(3)
        evacuation_tasks(2 if scenario.scenario_type == "flood" else 3)
        medical_tasks(3 if scenario.scenario_type == "flood" else 2)
        survey_tasks(1)
    elif scenario.scenario_type == "infrastructure":
        deliver_tasks(3)
        medical_tasks(2)
        survey_tasks(1)
        # A repair-kit delivery to the middle bridge, expressed as a logistics task.
        target_node = next(n for n in nodes if n.id == "N-2-2")
        district = district_by_id[target_node.district_id]
        add(
            kind="deliver",
            label="Deliver bridge repair kit · B-2",
            district_id=district.id,
            node_id=target_node.id,
            quantity=9.0,
            unit="t",
            priority=5,
            required_capability="supply",
            window_start_min=15,
            window_end_min=min(scenario.duration_minutes, 140),
            target_edge_id="B-2",
        )
    else:
        survey_tasks(4, start=20)
        for index in range(2):
            depot = depots[index % len(depots)]
            add(
                kind="deliver",
                label=f"Survey cache · {depot.name}",
                district_id=depot.district_id,
                node_id=depot.node_id,
                quantity=float(18 + index * 7),
                unit="t",
                priority=3,
                required_capability="supply",
                window_start_min=30 + index * 20,
                window_end_min=min(scenario.duration_minutes, 220),
                destination_facility_id=depot.id,
            )
        district = max(affected, key=lambda d: d.population)
        hospital = _nearest_facility(facilities, nodes, district, "hospital")
        add(
            kind="treat",
            label=f"Field clinic · {district.name}",
            district_id=district.id,
            node_id=_choose_node_in_district(nodes, district),
            quantity=18.0,
            unit="patients",
            priority=4,
            required_capability="medical",
            window_start_min=30,
            window_end_min=min(scenario.duration_minutes, 160),
            destination_facility_id=hospital.id,
        )

    # Always keep IDs stable and unique; sort by priority then id for a readable UI.
    demands.sort(key=lambda d: (-d.priority, d.id))
    for index, demand in enumerate(demands):
        demand.id = f"DEM-{index + 1:02d}"
    return demands


def _make_risk_grid(
    scenario: ScenarioConfig, heights: np.ndarray, size: float, seed: int
) -> RiskGrid:
    n = 32
    values: list[float] = []
    max_height = float(np.max(heights)) or 1.0
    fire = (size * 0.71, size * 0.29)
    for row in range(n):
        for col in range(n):
            x = (col + 0.5) / n * size
            z = (row + 0.5) / n * size
            elevation = _sample_height(heights, x, z, size)
            if scenario.scenario_type == "flood":
                distance = abs(x - _river_x(z, size, seed))
                risk = (
                    0.08
                    + 0.76
                    * math.exp(-((distance / 1250.0) ** 2))
                    * (0.35 + 0.65 * (1.0 - _clamp(elevation / 55.0, 0.0, 1.0)))
                    + 0.05 * (0.5 + 0.5 * math.sin(x / 170.0 + z / 240.0))
                )
            elif scenario.scenario_type == "wildfire":
                wind = math.radians(scenario.weather.wind_dir_deg)
                shifted = (fire[0] + math.cos(wind) * 380.0, fire[1] + math.sin(wind) * 380.0)
                distance = math.hypot(x - shifted[0], z - shifted[1])
                risk = 0.06 + 0.82 * math.exp(-((distance / 2400.0) ** 2)) * (
                    0.5 + 0.5 * (1.0 - _clamp(elevation / max_height, 0.0, 1.0))
                )
            elif scenario.scenario_type == "infrastructure":
                distance = min(
                    abs(x - _river_x(z, size, seed)),
                    math.hypot(x - size * 0.62, z - size * 0.5),
                )
                risk = 0.1 + 0.55 * math.exp(-((distance / 2100.0) ** 2))
            else:
                slope = abs(_sample_height(heights, x + 120, z, size) - elevation) + abs(
                    _sample_height(heights, x, z + 120, size) - elevation
                )
                risk = 0.12 + _clamp(slope / 45.0, 0.0, 0.6)
            values.append(round(_clamp(risk, 0.0, 1.0), 3))
    return RiskGrid(width=n, height=n, values=values)


def generate_world(scenario: ScenarioConfig) -> World:
    """Build a complete, deterministic fictional world for a scenario."""

    rng = np.random.default_rng(scenario.seed)
    size = MAP_SIZE
    n = GRID
    axis = np.linspace(0, size, n)
    yy, xx = np.mgrid[0:n, 0:n]
    gx = xx / (n - 1) * size

    noise = _value_noise(n, rng, octaves=4, base=4)
    ridge = 1.0 - np.abs(2.0 * _value_noise(n, rng, octaves=3, base=5) - 1.0)
    heights = 6.0 + noise * 116.0 + ridge * 48.0 + (gx / size) * 20.0
    river_center = np.array([_river_x(float(z), size, scenario.seed) for z in axis])
    river_distance = np.abs(gx - river_center[:, None])
    valley = np.clip(1.0 - river_distance / 660.0, 0.0, 1.0)
    heights -= (valley**1.35) * 72.0
    floodplain = river_distance < 930.0
    heights = np.where(
        floodplain,
        np.minimum(heights, 4.2 + (river_distance / 930.0) * 21.0 + noise * 2.4),
        heights,
    )
    heights = np.maximum(heights, 0.55)
    heights = np.round(heights, 2)

    districts = _make_districts(scenario, heights, size, rng)
    nodes = _make_nodes(districts, heights, size, rng)
    edges = _make_edges(nodes, scenario, size, rng)
    facilities = _make_facilities(nodes, districts, scenario, rng)
    assets = _make_assets(scenario, facilities)
    demands = _make_demands(scenario, districts, nodes, facilities, size)
    risk_grid = _make_risk_grid(scenario, heights, size, scenario.seed)

    quantized = np.round(heights / 0.05).astype(np.int16)
    heightmap_b64 = base64.b64encode(quantized.tobytes(order="C")).decode("ascii")
    terrain = TerrainData(
        width=n,
        height=n,
        cell_size_m=round(size / (n - 1), 2),
        min_elevation_m=float(np.min(heights)),
        max_elevation_m=float(np.max(heights)),
        heightmap_b64=heightmap_b64,
        heightmap_scale=0.05,
        contour_interval_m=10.0,
    )
    river = River(
        polyline=[
            (round(_river_x(float(z), size, scenario.seed), 1), round(float(z), 1))
            for z in np.linspace(0, size, 33)
        ],
        width_m=72.0,
        base_level_m=0.6,
    )
    if scenario.scenario_type == "flood":
        peak = _clamp(1.6 + scenario.weather.rainfall_mm_h / 16.0, 2.2, 3.3)
        hazard = HazardProfile(
            kind="flood",
            base_level_m=0.5,
            peak_level_m=round(peak, 2),
            notes="Rainfall-driven river rise; low crossings close sequentially.",
        )
    elif scenario.scenario_type == "wildfire":
        hazard = HazardProfile(
            kind="wildfire",
            base_level_m=0.6,
            peak_level_m=0.8,
            fire_center=(size * 0.71, size * 0.29),
            fire_radius_peak_km=round(2.0 + scenario.weather.wind_kph / 18.0, 2),
            wind_dir_deg=scenario.weather.wind_dir_deg,
            notes="Wind-driven perimeter with smoke-limited visibility.",
        )
    elif scenario.scenario_type == "infrastructure":
        hazard = HazardProfile(
            kind="infrastructure",
            base_level_m=0.6,
            peak_level_m=0.9,
            notes="Two crossings and one relay are degraded by the disruption.",
        )
    else:
        hazard = HazardProfile(
            kind="exploration",
            base_level_m=0.5,
            peak_level_m=0.6,
            notes="Terrain and daylight, not inundation, are the limiting factors.",
        )

    title = str(PRESET_NAMES[scenario.world_preset]["title"])
    world = World(
        id="",
        hash="",
        seed=scenario.seed,
        preset=scenario.world_preset,
        scenario_type=scenario.scenario_type,
        title=title,
        algorithm_version=ALGORITHM_VERSION,
        terrain=terrain,
        districts=districts,
        nodes=nodes,
        edges=edges,
        facilities=facilities,
        assets=assets,
        demands=demands,
        river=river,
        hazard=hazard,
        risk_grid=risk_grid,
        population_total=sum(d.population for d in districts),
        map_size_m=size,
    )
    world.hash = canonical_hash(world.model_dump(mode="json", exclude={"id", "hash"}))
    world.id = f"W-{world.hash[:10]}"
    return world


def summarize_world(world: World) -> dict:
    return {
        "id": world.id,
        "hash": world.hash,
        "title": world.title,
        "districts": len(world.districts),
        "nodes": len(world.nodes),
        "edges": len(world.edges),
        "facilities": len(world.facilities),
        "assets": len(world.assets),
        "demands": len(world.demands),
        "population_total": world.population_total,
    }


def iter_edges(world: World, edge_ids: Iterable[str]) -> Iterable[RoadEdge]:
    wanted = set(edge_ids)
    for edge in world.edges:
        if edge.id in wanted:
            yield edge
