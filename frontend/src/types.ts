export type ScenarioType = 'flood' | 'wildfire' | 'infrastructure' | 'exploration';
export type WorldPreset = 'riverbend' | 'cedar_ridge' | 'arclight' | 'meridian';
export type ExecutionMode = 'deterministic' | 'gemini';
export type RunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'needs_attention'
  | 'failed'
  | 'cancelled'
  | 'interrupted';
export type Severity = 'error' | 'warning' | 'info';
export type Vec2 = [number, number];

export type AgentId =
  | 'director'
  | 'intake'
  | 'world'
  | 'conditions'
  | 'resources'
  | 'access'
  | 'critic'
  | 'simulation'
  | 'reporter';

export interface WeatherConfig {
  rainfall_mm_h: number;
  wind_kph: number;
  wind_dir_deg: number;
  visibility_km: number;
  terrain_saturation: number;
}

export interface ResourceConfig {
  rescue_teams: number;
  medical_units: number;
  supply_vehicles: number;
  survey_drones: number;
}

export interface ObjectiveConfig {
  coverage: number;
  delivery: number;
  response_time: number;
  survey: number;
}

export interface ScenarioConfig {
  name: string;
  scenario_type: ScenarioType;
  world_preset: WorldPreset;
  seed: number;
  duration_minutes: number;
  start_hour: number;
  disruption_level: number;
  affected_district_ids: string[];
  weather: WeatherConfig;
  resources: ResourceConfig;
  objectives: ObjectiveConfig;
  execution_mode: ExecutionMode;
}

export interface PresetInfo {
  id: string;
  name: string;
  tagline: string;
  scenario_type: ScenarioType;
  world_preset: WorldPreset;
  description: string;
  accent: string;
  tags: string[];
  scenario: ScenarioConfig;
}

export interface AgentDescriptor {
  id: AgentId;
  name: string;
  role: string;
  mode: ExecutionMode;
  depends_on: string[];
}

export interface MetaResponse {
  product: string;
  version: string;
  execution_mode: ExecutionMode;
  gemini_configured: boolean;
  max_revisions: number;
  scenario_types: ScenarioType[];
  world_presets: WorldPreset[];
  algorithm_versions: Record<string, string>;
  disclaimer: string;
}

export interface HealthResponse {
  status: 'ok';
  version: string;
  database: 'ok';
}

export interface TerrainData {
  width: number;
  height: number;
  cell_size_m: number;
  min_elevation_m: number;
  max_elevation_m: number;
  heightmap_b64: string;
  heightmap_scale: number;
  contour_interval_m: number;
}

export interface District {
  id: string;
  name: string;
  polygon: Vec2[];
  centroid: Vec2;
  population: number;
  risk_base: number;
  tag: string;
  elevation_m: number;
}

export interface RoadNode {
  id: string;
  x: number;
  z: number;
  elevation_m: number;
  district_id: string;
  kind: string;
}

export interface RoadEdge {
  id: string;
  a: string;
  b: string;
  polyline: Vec2[];
  length_m: number;
  speed_kph: number;
  capacity: number;
  bridge: boolean;
  clearance_m: number | null;
  low_point_m: number;
  label: string;
}

export interface Facility {
  id: string;
  name: string;
  type: 'shelter' | 'hospital' | 'depot' | 'command' | 'relay' | 'survey';
  node_id: string;
  district_id: string;
  capacity: number;
  stock: number;
  status: string;
}

export interface AssetSpec {
  id: string;
  callsign: string;
  type: 'rescue' | 'medical' | 'supply' | 'drone';
  home_node_id: string;
  capability: string;
  capacity: number;
  speed_kph: number;
  available_from_min: number;
  available_until_min: number;
}

export interface Demand {
  id: string;
  kind: 'deliver' | 'evacuate' | 'treat' | 'survey' | 'repair';
  label: string;
  district_id: string;
  node_id: string;
  quantity: number;
  unit: string;
  priority: number;
  required_capability: string;
  window_start_min: number;
  window_end_min: number;
  destination_facility_id: string | null;
  target_edge_id: string | null;
}

export interface River {
  polyline: Vec2[];
  width_m: number;
  base_level_m: number;
}

export interface HazardProfile {
  kind: ScenarioType;
  base_level_m: number;
  peak_level_m: number;
  fire_center: Vec2;
  fire_radius_peak_km: number;
  wind_dir_deg: number;
  notes: string;
}

export interface RiskGrid {
  width: number;
  height: number;
  values: number[];
}

export interface World {
  id: string;
  hash: string;
  seed: number;
  preset: WorldPreset;
  scenario_type: ScenarioType;
  title: string;
  algorithm_version: string;
  terrain: TerrainData;
  districts: District[];
  nodes: RoadNode[];
  edges: RoadEdge[];
  facilities: Facility[];
  assets: AssetSpec[];
  demands: Demand[];
  river: River;
  hazard: HazardProfile;
  risk_grid: RiskGrid;
  population_total: number;
  map_size_m: number;
}

export interface IntakeArtifact {
  id: string;
  session_id: string;
  scenario: ScenarioConfig;
  accepted: boolean;
  notes: string[];
  warnings: string[];
}

export interface ConditionsReport {
  summary: string;
  assumptions: string[];
  travel_factor: number;
  visibility_factor: number;
  planning_horizon_min: number;
  water_level_at_horizon_m: number;
  fire_radius_at_horizon_km: number;
  closed_edge_ids: string[];
  risk_notes: string[];
  mode: ExecutionMode;
  version: string;
}

export interface AccessRoute {
  demand_id: string;
  origin_node_id: string;
  target_node_id: string;
  edge_ids: string[];
  travel_min: number;
  reachable: boolean;
  blocked_edge_ids: string[];
}

export interface AccessReport {
  summary: string;
  routes: AccessRoute[];
  unreachable_demand_ids: string[];
  closed_edge_ids: string[];
  planning_horizon_min: number;
  assumptions: string[];
  mode: ExecutionMode;
  version: string;
  hash: string;
}

export type AssignedStatus = 'proposed' | 'validated' | 'rejected' | 'deferred';

export interface Assignment {
  id: string;
  demand_id: string;
  asset_id: string;
  origin_node_id: string;
  target_node_id: string;
  route_edge_ids: string[];
  start_min: number;
  travel_min: number;
  service_min: number;
  end_min: number;
  load: number;
  status: AssignedStatus;
  rationale: string;
  destination_facility_id: string | null;
  route_source: 'static' | 'validated' | 'repaired';
}

export interface UnassignedDemand {
  demand_id: string;
  priority: number;
  reason: string;
}

export interface AllocationProposal {
  id: string;
  assignments: Assignment[];
  unassigned: UnassignedDemand[];
  assumptions: string[];
  mode: ExecutionMode;
  revision: number;
  hash: string;
}

export interface Finding {
  id: string;
  severity: Severity;
  code: string;
  message: string;
  entity_ids: string[];
  evidence: Record<string, unknown>;
  repair_hint: string;
}

export interface VerificationReport {
  id: string;
  stage: 'preflight' | 'outcome';
  passed: boolean;
  findings: Finding[];
  checked_count: number;
  revision: number;
  summary: string;
  metrics: Record<string, unknown>;
  mode: ExecutionMode;
  version: string;
  hash: string;
}

export interface AssetState {
  id: string;
  callsign: string;
  type: 'rescue' | 'medical' | 'supply' | 'drone';
  x: number;
  z: number;
  status: 'staged' | 'en_route' | 'serving' | 'complete' | 'blocked' | 'failed';
  assignment_id: string | null;
  demand_id: string | null;
  progress: number;
}

export interface RoadState {
  edge_id: string;
  status: 'open' | 'closed' | 'degraded';
  reason: string;
}

export interface HazardState {
  water_level_m: number;
  fire_radius_km: number;
  wind_kph: number;
  visibility_km: number;
  summary: string;
}

export interface SimulationMetrics {
  coverage_pct: number;
  delivery_pct: number;
  survey_pct: number;
  median_response_min: number;
  utilization_pct: number;
  unmet_demand: number;
  completed_tasks: number;
  total_tasks: number;
  objective_score: number;
}

export type SimulationEventKind =
  | 'dispatch'
  | 'arrival'
  | 'service_start'
  | 'service_complete'
  | 'task_completed'
  | 'blocked'
  | 'rerouted'
  | 'task_deferred'
  | 'task_failed'
  | 'road_closed'
  | 'road_open'
  | 'hazard_threshold';

export interface SimulationEvent {
  id: string;
  t_min: number;
  kind: SimulationEventKind;
  entity_ids: string[];
  message: string;
}

export interface SimulationRoute {
  assignment_id: string;
  demand_id: string;
  asset_id: string;
  edge_ids: string[];
  state: 'proposed' | 'validated' | 'rejected' | 'blocked';
  label: string;
}

export interface InvariantCheck {
  code: string;
  passed: boolean;
  detail: string;
}

export interface Snapshot {
  tick: number;
  sim_time_min: number;
  clock: string;
  assets: AssetState[];
  roads: RoadState[];
  hazard: HazardState;
  metrics: SimulationMetrics;
  event_ids: string[];
}

export interface SimulationResult {
  id: string;
  snapshots: Snapshot[];
  events: SimulationEvent[];
  routes: SimulationRoute[];
  metrics: SimulationMetrics;
  invariants: InvariantCheck[];
  algorithm_version: string;
  revision: number;
  duration_min: number;
  hash: string;
}

export interface AgentSummary {
  id: string;
  name: string;
  mode: ExecutionMode;
  status: 'completed' | 'failed' | 'needs_attention';
  duration_ms: number;
  artifact_hash: string;
  calls: number;
  note: string;
}

export interface ReportMetrics {
  coverage_pct: number;
  delivery_pct: number;
  survey_pct: number;
  median_response_min: number;
  utilization_pct: number;
  objective_score: number;
  completed_tasks: number;
  total_tasks: number;
  unmet_demand: number;
}

export interface RevisionRecord {
  attempt: number;
  trigger_stage: 'preflight' | 'outcome';
  trigger_codes: string[];
  changes: string[];
  assignments_changed: number;
  demands_deferred: number;
}

export interface FinalReport {
  id: string;
  run_id: string;
  title: string;
  generated_at: string;
  scenario: ScenarioConfig;
  execution_mode: ExecutionMode;
  effective_mode: ExecutionMode;
  model_calls: number;
  world_hash: string;
  input_hash: string;
  result_hash: string;
  simulation_hash: string;
  metrics: ReportMetrics;
  assignments: Assignment[];
  unassigned: UnassignedDemand[];
  findings: Finding[];
  revisions: RevisionRecord[];
  agents: AgentSummary[];
  assumptions: string[];
  narrative: string[];
  algorithm_versions: Record<string, string>;
  disclaimer: string;
  markdown: string;
}

export interface RunManifest {
  run_id: string;
  requested_mode: ExecutionMode;
  effective_mode: ExecutionMode;
  model_calls: number;
  input_hash: string;
  world_hash: string;
  simulation_hash: string;
  result_hash: string;
  revisions: number;
  algorithm_versions: Record<string, string>;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  status: RunStatus;
}

export interface RunRecord {
  id: string;
  status: RunStatus;
  scenario: ScenarioConfig;
  created_at: string;
  updated_at: string;
  effective_mode: ExecutionMode;
  current_agent: string | null;
  revision_count: number;
  model_calls: number;
  world_hash: string;
  result_hash: string;
  error: string | null;
  manifest: RunManifest | null;
  has_report: boolean;
}

export interface RunEvent {
  event_id: string;
  run_id: string;
  seq: number;
  type: string;
  ts: string;
  agent_id: string | null;
  status: string | null;
  payload: Record<string, unknown>;
}

export interface ArtifactSummary {
  kind: string;
  artifact_id: string;
  hash: string;
  summary: Record<string, unknown>;
}

export interface PreviewResponse {
  world: World;
  draft: boolean;
  generator_version: string;
  input_hash: string;
}

export interface RunCreated {
  run_id: string;
  status: RunStatus;
  stream_url: string;
}

export interface ReportBundle {
  report: FinalReport;
  markdown: string;
}

export interface RunBundle {
  run: RunRecord;
  artifacts: Record<string, unknown>;
  report: FinalReport | null;
  report_markdown: string;
}

export interface Artifacts {
  intake?: IntakeArtifact;
  world?: World;
  conditions?: ConditionsReport;
  proposal?: AllocationProposal;
  access?: AccessReport;
  preflight?: VerificationReport;
  simulation?: SimulationResult;
  outcome?: VerificationReport;
  report?: FinalReport;
  manifest?: RunManifest;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details: string[];
}

export interface ScenarioValidation {
  ok: boolean;
  errors: string[];
}
