"""Typed contracts shared by the API, ADK workflow, simulation, and frontend.

The contract layer is deliberately strict: agents never exchange free-form prose
as authoritative state. Every boundary uses ``extra="forbid"`` and bounded fields.
"""

from __future__ import annotations

import hashlib
import json
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ScenarioType = Literal["flood", "wildfire", "infrastructure", "exploration"]
WorldPreset = Literal["riverbend", "cedar_ridge", "arclight", "meridian"]
ExecutionMode = Literal["deterministic", "gemini"]
RunStatus = Literal[
    "queued",
    "running",
    "completed",
    "needs_attention",
    "failed",
    "cancelled",
    "interrupted",
]
AssignedStatus = Literal["proposed", "validated", "rejected", "deferred"]
Severity = Literal["error", "warning", "info"]

Vec2 = tuple[float, float]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


def canonical_hash(value: BaseModel | dict | list) -> str:
    if isinstance(value, BaseModel):
        value = value.model_dump(mode="json", exclude_none=True)
    text = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Scenario input
# ---------------------------------------------------------------------------


class WeatherConfig(StrictModel):
    rainfall_mm_h: float = Field(default=26.0, ge=0, le=150)
    wind_kph: float = Field(default=22.0, ge=0, le=180)
    wind_dir_deg: float = Field(default=225.0, ge=0, le=360)
    visibility_km: float = Field(default=6.0, ge=0.1, le=40)
    terrain_saturation: float = Field(default=0.62, ge=0, le=1)


class ResourceConfig(StrictModel):
    rescue_teams: int = Field(default=4, ge=0, le=12)
    medical_units: int = Field(default=2, ge=0, le=12)
    supply_vehicles: int = Field(default=4, ge=0, le=12)
    survey_drones: int = Field(default=2, ge=0, le=12)

    @model_validator(mode="after")
    def at_least_one(self) -> ResourceConfig:
        if self.rescue_teams + self.medical_units + self.supply_vehicles + self.survey_drones < 1:
            raise ValueError("at least one resource asset is required")
        return self


class ObjectiveConfig(StrictModel):
    coverage: float = Field(default=0.40, ge=0, le=1)
    delivery: float = Field(default=0.28, ge=0, le=1)
    response_time: float = Field(default=0.22, ge=0, le=1)
    survey: float = Field(default=0.10, ge=0, le=1)

    @model_validator(mode="after")
    def weights_present(self) -> ObjectiveConfig:
        if self.coverage + self.delivery + self.response_time + self.survey <= 0:
            raise ValueError("at least one objective weight must be positive")
        return self


class ScenarioConfig(StrictModel):
    name: str = Field(default="Riverbend Delta Flood", min_length=2, max_length=80)
    scenario_type: ScenarioType = "flood"
    world_preset: WorldPreset = "riverbend"
    seed: int = Field(default=1847, ge=0, le=2_147_483_647)
    duration_minutes: int = Field(default=360, ge=90, le=720)
    start_hour: int = Field(default=6, ge=0, le=23)
    disruption_level: float = Field(default=0.55, ge=0, le=1)
    affected_district_ids: list[str] = Field(default_factory=list, min_length=1, max_length=6)
    weather: WeatherConfig = Field(default_factory=WeatherConfig)
    resources: ResourceConfig = Field(default_factory=ResourceConfig)
    objectives: ObjectiveConfig = Field(default_factory=ObjectiveConfig)
    execution_mode: ExecutionMode = "deterministic"

    @field_validator("affected_district_ids")
    @classmethod
    def unique_districts(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("affected district ids must be unique")
        return value

    @model_validator(mode="after")
    def sensible_windows(self) -> ScenarioConfig:
        if self.duration_minutes < 90:
            raise ValueError("duration must be at least 90 minutes")
        return self

    @property
    def input_hash(self) -> str:
        return canonical_hash(self)


# ---------------------------------------------------------------------------
# World
# ---------------------------------------------------------------------------


class TerrainData(StrictModel):
    width: int = Field(ge=16, le=256)
    height: int = Field(ge=16, le=256)
    cell_size_m: float = Field(gt=0)
    min_elevation_m: float
    max_elevation_m: float
    heightmap_b64: str
    heightmap_scale: float = 0.05
    contour_interval_m: float = 10.0


class District(StrictModel):
    id: str
    name: str
    polygon: list[Vec2] = Field(min_length=3)
    centroid: Vec2
    population: int = Field(ge=0)
    risk_base: float = Field(ge=0, le=1)
    tag: str
    elevation_m: float


class RoadNode(StrictModel):
    id: str
    x: float
    z: float
    elevation_m: float
    district_id: str
    kind: Literal["junction", "facility", "depot"] = "junction"


class RoadEdge(StrictModel):
    id: str
    a: str
    b: str
    polyline: list[Vec2] = Field(min_length=2)
    length_m: float = Field(gt=0)
    speed_kph: float = Field(gt=0)
    capacity: int = Field(gt=0)
    bridge: bool = False
    clearance_m: float | None = None
    low_point_m: float
    label: str = ""


class FacilityType(str):
    pass


class Facility(StrictModel):
    id: str
    name: str
    type: Literal["shelter", "hospital", "depot", "comms", "command"]
    node_id: str
    district_id: str
    capacity: int = Field(ge=0)
    stock: float = Field(ge=0)
    status: Literal["open", "degraded", "closed"] = "open"


class AssetType(str):
    pass


class AssetSpec(StrictModel):
    id: str
    callsign: str
    type: Literal["rescue", "medical", "supply", "drone"]
    home_node_id: str
    capability: Literal["rescue", "medical", "supply", "survey", "repair"]
    capacity: float = Field(gt=0)
    speed_kph: float = Field(gt=0)
    available_from_min: int = Field(default=0, ge=0)
    available_until_min: int = Field(default=720, ge=0)


class DemandKind(str):
    pass


class Demand(StrictModel):
    id: str
    kind: Literal["deliver", "evacuate", "treat", "survey", "repair"]
    label: str
    district_id: str
    node_id: str
    quantity: float = Field(gt=0)
    unit: Literal["t", "persons", "patients", "zones", "jobs"]
    priority: int = Field(ge=1, le=5)
    required_capability: Literal["rescue", "medical", "supply", "survey", "repair"]
    window_start_min: int = Field(ge=0)
    window_end_min: int = Field(ge=0)
    destination_facility_id: str | None = None
    target_edge_id: str | None = None

    @model_validator(mode="after")
    def valid_window(self) -> Demand:
        if self.window_end_min <= self.window_start_min:
            raise ValueError("demand window must end after it starts")
        return self


class River(StrictModel):
    polyline: list[Vec2] = Field(min_length=2)
    width_m: float = Field(gt=0)
    base_level_m: float


class HazardProfile(StrictModel):
    kind: Literal["flood", "wildfire", "infrastructure", "exploration"]
    base_level_m: float = 0.6
    peak_level_m: float = 3.0
    fire_center: Vec2 = (4000.0, 4000.0)
    fire_radius_peak_km: float = 4.2
    wind_dir_deg: float = 225
    notes: str = ""


class RiskGrid(StrictModel):
    width: int
    height: int
    values: list[float]


class World(StrictModel):
    id: str
    hash: str
    seed: int
    preset: WorldPreset
    scenario_type: ScenarioType
    title: str
    algorithm_version: str
    terrain: TerrainData
    districts: list[District]
    nodes: list[RoadNode]
    edges: list[RoadEdge]
    facilities: list[Facility]
    assets: list[AssetSpec]
    demands: list[Demand]
    river: River
    hazard: HazardProfile
    risk_grid: RiskGrid
    population_total: int
    map_size_m: float


# ---------------------------------------------------------------------------
# Agent artifacts
# ---------------------------------------------------------------------------


class IntakeArtifact(StrictModel):
    session_id: str
    scenario: ScenarioConfig
    accepted: bool
    notes: list[str]
    warnings: list[str] = Field(default_factory=list)


class ConditionsReport(StrictModel):
    summary: str
    assumptions: list[str]
    travel_factor: float = Field(ge=0.4, le=2.0)
    visibility_factor: float = Field(ge=0.4, le=2.0)
    planning_horizon_min: int
    water_level_at_horizon_m: float
    fire_radius_at_horizon_km: float
    closed_edge_ids: list[str]
    risk_notes: list[str]
    mode: ExecutionMode = "deterministic"
    version: str = "conditions-1.0"


class AccessRoute(StrictModel):
    demand_id: str
    origin_node_id: str
    target_node_id: str
    edge_ids: list[str]
    travel_min: float
    reachable: bool
    blocked_edge_ids: list[str] = Field(default_factory=list)


class AccessReport(StrictModel):
    summary: str
    routes: list[AccessRoute]
    unreachable_demand_ids: list[str]
    closed_edge_ids: list[str]
    planning_horizon_min: int
    assumptions: list[str]
    mode: ExecutionMode = "deterministic"
    version: str = "access-1.0"
    hash: str = ""

    def with_hash(self) -> AccessReport:
        self.hash = canonical_hash(self.model_dump(mode="json", exclude={"hash"}))
        return self


class UnassignedDemand(StrictModel):
    demand_id: str
    reason: str
    priority: int


class Assignment(StrictModel):
    id: str
    demand_id: str
    asset_id: str
    origin_node_id: str
    target_node_id: str
    route_edge_ids: list[str]
    start_min: float = Field(ge=0)
    travel_min: float = Field(ge=0)
    service_min: float = Field(ge=0)
    end_min: float = Field(ge=0)
    load: float = Field(ge=0)
    status: AssignedStatus = "proposed"
    rationale: str
    destination_facility_id: str | None = None
    route_source: Literal["static", "validated", "repaired"] = "static"

    @model_validator(mode="after")
    def ordered(self) -> Assignment:
        if self.end_min < self.start_min:
            raise ValueError("assignment end must not precede start")
        return self


class AllocationProposal(StrictModel):
    id: str
    assignments: list[Assignment]
    unassigned: list[UnassignedDemand]
    assumptions: list[str]
    policy_version: str
    mode: ExecutionMode = "deterministic"
    revision: int = 0
    hash: str = ""

    def with_hash(self) -> AllocationProposal:
        self.hash = canonical_hash(self.model_dump(mode="json", exclude={"hash", "id"}))
        return self


class Finding(StrictModel):
    id: str
    severity: Severity
    code: str
    message: str
    entity_ids: list[str] = Field(default_factory=list)
    evidence: dict = Field(default_factory=dict)
    repair_hint: str = ""


class VerificationReport(StrictModel):
    id: str
    stage: Literal["preflight", "outcome"]
    passed: bool
    findings: list[Finding]
    checked_count: int
    revision: int
    summary: str
    metrics: dict = Field(default_factory=dict)
    mode: ExecutionMode = "deterministic"
    version: str = "verifier-1.0"
    hash: str = ""

    @property
    def error_count(self) -> int:
        return sum(1 for finding in self.findings if finding.severity == "error")

    def with_hash(self) -> VerificationReport:
        self.hash = canonical_hash(self.model_dump(mode="json", exclude={"hash", "id"}))
        return self


class RevisionRecord(StrictModel):
    attempt: int
    trigger_stage: Literal["preflight", "outcome"]
    trigger_codes: list[str]
    changes: list[str]
    assignments_changed: int
    demands_deferred: int


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------


class SimulationEvent(StrictModel):
    id: str
    t_min: int
    kind: Literal[
        "dispatch",
        "arrival",
        "service_start",
        "service_complete",
        "task_completed",
        "blocked",
        "rerouted",
        "task_deferred",
        "task_failed",
        "road_closed",
        "road_open",
        "hazard_threshold",
    ]
    entity_ids: list[str]
    message: str
    severity: Literal["info", "warning", "error"] = "info"


class AssetState(StrictModel):
    id: str
    callsign: str
    type: Literal["rescue", "medical", "supply", "drone"]
    x: float
    z: float
    status: Literal["staged", "en_route", "serving", "complete", "blocked", "failed"]
    assignment_id: str | None = None
    demand_id: str | None = None
    progress: float = Field(default=0, ge=0, le=1)


class RoadState(StrictModel):
    edge_id: str
    status: Literal["open", "closed", "degraded"]
    reason: str = ""


class HazardState(StrictModel):
    water_level_m: float = 0.0
    fire_radius_km: float = 0.0
    wind_kph: float = 0.0
    visibility_km: float = 0.0
    summary: str


class SimulationMetrics(StrictModel):
    coverage_pct: float = Field(ge=0, le=100)
    delivery_pct: float = Field(ge=0, le=100)
    survey_pct: float = Field(ge=0, le=100)
    median_response_min: float = Field(ge=0)
    utilization_pct: float = Field(ge=0, le=100)
    unmet_demand: int = Field(ge=0)
    completed_tasks: int = Field(ge=0)
    total_tasks: int = Field(ge=0)
    objective_score: float = Field(ge=0, le=100)


class SimulationRoute(StrictModel):
    assignment_id: str
    demand_id: str
    asset_id: str
    edge_ids: list[str]
    state: Literal["proposed", "validated", "rejected", "blocked"]
    label: str


class InvariantCheck(StrictModel):
    code: str
    passed: bool
    detail: str


class Snapshot(StrictModel):
    tick: int
    sim_time_min: int
    clock: str
    assets: list[AssetState]
    roads: list[RoadState]
    hazard: HazardState
    metrics: SimulationMetrics
    event_ids: list[str] = Field(default_factory=list)


class SimulationResult(StrictModel):
    id: str
    snapshots: list[Snapshot]
    events: list[SimulationEvent]
    routes: list[SimulationRoute]
    metrics: SimulationMetrics
    invariants: list[InvariantCheck]
    algorithm_version: str
    revision: int
    duration_min: int
    hash: str = ""

    def with_hash(self) -> SimulationResult:
        self.hash = canonical_hash(self.model_dump(mode="json", exclude={"hash", "id"}))
        return self


# ---------------------------------------------------------------------------
# Reports and run lifecycle
# ---------------------------------------------------------------------------


class AgentSummary(StrictModel):
    id: str
    name: str
    mode: ExecutionMode
    status: Literal["completed", "failed", "needs_attention"]
    duration_ms: int = Field(ge=0)
    artifact_hash: str = ""
    calls: int = Field(default=0, ge=0)
    note: str = ""


class ReportMetrics(StrictModel):
    coverage_pct: float
    delivery_pct: float
    survey_pct: float
    median_response_min: float
    utilization_pct: float
    objective_score: float
    completed_tasks: int
    total_tasks: int
    unmet_demand: int


class FinalReport(StrictModel):
    id: str
    run_id: str
    title: str
    generated_at: str
    scenario: ScenarioConfig
    execution_mode: ExecutionMode
    effective_mode: ExecutionMode
    model_calls: int
    world_hash: str
    input_hash: str
    result_hash: str
    simulation_hash: str
    metrics: ReportMetrics
    assignments: list[Assignment]
    unassigned: list[UnassignedDemand]
    findings: list[Finding]
    revisions: list[RevisionRecord]
    agents: list[AgentSummary]
    assumptions: list[str]
    narrative: list[str]
    algorithm_versions: dict[str, str]
    disclaimer: str
    markdown: str = ""


class RunManifest(StrictModel):
    run_id: str
    requested_mode: ExecutionMode
    effective_mode: ExecutionMode
    model_calls: int
    input_hash: str
    world_hash: str = ""
    simulation_hash: str = ""
    result_hash: str = ""
    revisions: int = 0
    algorithm_versions: dict[str, str]
    started_at: str
    completed_at: str = ""
    duration_ms: int = 0
    status: RunStatus = "queued"


class RunRecord(StrictModel):
    id: str
    status: RunStatus
    scenario: ScenarioConfig
    created_at: str
    updated_at: str
    effective_mode: ExecutionMode = "deterministic"
    current_agent: str | None = None
    revision_count: int = 0
    model_calls: int = 0
    world_hash: str = ""
    result_hash: str = ""
    error: str | None = None
    manifest: RunManifest | None = None
    has_report: bool = False


class RunCreated(StrictModel):
    run_id: str
    status: RunStatus
    stream_url: str


class RunEvent(StrictModel):
    event_id: str
    run_id: str
    seq: int
    type: str
    ts: str
    agent_id: str | None = None
    status: str | None = None
    payload: dict = Field(default_factory=dict)


class AgentDescriptor(StrictModel):
    id: str
    name: str
    role: str
    mode: ExecutionMode
    depends_on: list[str]


class PresetInfo(StrictModel):
    id: str
    name: str
    tagline: str
    scenario_type: ScenarioType
    world_preset: WorldPreset
    description: str
    accent: str
    scenario: ScenarioConfig
    tags: list[str]


class HealthResponse(StrictModel):
    status: Literal["ok"]
    version: str
    database: Literal["ok"]


class MetaResponse(StrictModel):
    product: str
    version: str
    execution_mode: str
    gemini_configured: bool
    max_revisions: int
    scenario_types: list[str]
    world_presets: list[str]
    algorithm_versions: dict[str, str]
    disclaimer: str


class ErrorResponse(StrictModel):
    code: str
    message: str
    details: list[str] = Field(default_factory=list)


class PreviewRequest(StrictModel):
    scenario: ScenarioConfig


class PreviewResponse(StrictModel):
    world: World
    draft: bool = True
    generator_version: str
    input_hash: str


class ReportBundle(StrictModel):
    report: FinalReport
    markdown: str


PositiveInt = Annotated[int, Field(gt=0)]
