import { Component, useEffect, useMemo, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Crosshair,
  Eye,
  Focus,
  Layers3,
  Maximize2,
  RotateCcw,
  ScanLine,
  SlidersHorizontal,
  Terminal,
  X,
} from 'lucide-react';

import {
  formatMinutes,
  formatPct,
  shortHash,
  titleCase,
} from '../lib/format';
import { decodeHeightmap } from '../lib/sceneMath';
import {
  QUALITY_DPR,
  VIEW_PRESETS,
  viewPresetById,
  type QualityLevel,
  type ViewPresetId,
} from '../lib/viewPresets';
import {
  affectedAssignmentIds,
  selectInitialProposal,
  selectSceneSource,
  selectWorld,
  useAppStore,
  type LayerState,
} from '../store/useAppStore';
import type { ScenarioConfig, World } from '../types';
import { Segmented, Toggle } from './Controls';
import Scene3D from '../scene/Scene3D';
import styles from './SceneView.module.css';

class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The schematic fallback is the visible report; no retry loop is attempted.
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);
  return reduced;
}

const LAYER_META: Array<{ key: keyof LayerState; label: string; hint: string }> = [
  { key: 'districts', label: 'Districts', hint: 'Boundaries and centrelines' },
  { key: 'risk', label: 'Risk surface', hint: 'Baked hazard-risk heatmap' },
  { key: 'coverage', label: 'Coverage rings', hint: 'Facility service range' },
  { key: 'routes', label: 'Final routes', hint: 'Validated assignment paths' },
  { key: 'proposed', label: 'Proposed / rejected', hint: 'Pre-revision route ghosts' },
  { key: 'trails', label: 'Asset trails', hint: 'Movement from home nodes' },
  { key: 'assets', label: 'Assets', hint: 'Synthetic response units' },
  { key: 'facilities', label: 'Facilities', hint: 'Shelters, depots, command' },
  { key: 'labels', label: 'Map labels', hint: 'Interactive scene callouts' },
  { key: 'weather', label: 'Weather FX', hint: 'Rain or drift particles' },
];

export default function SceneView({ active = true }: { active?: boolean }) {
  const world = useAppStore(selectWorld);
  const source = useAppStore(selectSceneSource);
  const scenario = useAppStore(
    (state) =>
      state.run?.scenario ??
      state.artifacts.report?.scenario ??
      state.artifacts.intake?.scenario ??
      state.draft,
  );
  const snapshot = useAppStore((state) => {
    const simulation = state.artifacts.simulation;
    if (!simulation?.snapshots?.length) return null;
    return (
      simulation.snapshots.find((candidate) => candidate.tick === state.selectedTick) ??
      simulation.snapshots[simulation.snapshots.length - 1]
    );
  });
  const simulation = useAppStore((state) => state.artifacts.simulation ?? null);
  const proposalArtifact = useAppStore((state) => state.artifacts.proposal ?? null);
  const report = useAppStore((state) => state.artifacts.report ?? state.bundle?.report ?? null);
  const preflightFindings = useAppStore((state) => state.artifacts.preflight?.findings ?? null);
  const outcomeFindings = useAppStore((state) => state.artifacts.outcome?.findings ?? null);
  const runStatus = useAppStore((state) => state.run?.status ?? null);
  const initialProposal = useAppStore(selectInitialProposal);
  const proposal = useMemo(() => {
    if (proposalArtifact) return proposalArtifact;
    if (!report) return null;
    return {
      id: report.id,
      assignments: report.assignments,
      unassigned: report.unassigned,
      assumptions: report.assumptions,
      mode: report.effective_mode,
      revision: report.revisions.length,
      hash: report.result_hash,
    };
  }, [proposalArtifact, report]);
  const rejectedAssignments = useMemo(() => {
    const terminal = runStatus
      ? ['completed', 'needs_attention', 'failed', 'cancelled', 'interrupted'].includes(runStatus)
      : false;
    const source = terminal
      ? report?.findings?.length
        ? report.findings
        : [...(preflightFindings ?? []), ...(outcomeFindings ?? [])]
      : preflightFindings ?? [];
    return affectedAssignmentIds(source);
  }, [outcomeFindings, preflightFindings, report, runStatus]);
  const conditions = useAppStore((state) => state.artifacts.conditions ?? null);
  const viewPresetId = useAppStore((state) => state.viewPreset);
  const quality = useAppStore((state) => state.quality);
  const lighting = useAppStore((state) => state.lighting);
  const layers = useAppStore((state) => state.layers);
  const selection = useAppStore((state) => state.selection);
  const focusNonce = useAppStore((state) => state.focusNonce);
  const sceneFallbackNotice = useAppStore((state) => state.sceneFallbackNotice);
  const setViewPreset = useAppStore((state) => state.setViewPreset);
  const setQuality = useAppStore((state) => state.setQuality);
  const setLighting = useAppStore((state) => state.setLighting);
  const toggleLayer = useAppStore((state) => state.toggleLayer);
  const selectEntity = useAppStore((state) => state.selectEntity);
  const focusSelection = useAppStore((state) => state.focusSelection);
  const [layersOpen, setLayersOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const reducedMotion = useReducedMotion();
  const preset = viewPresetById(viewPresetId);
  const heights = useMemo(() => (world ? decodeHeightmap(world) : null), [world]);
  const selectedLayerCount = Object.values(layers).filter(Boolean).length;

  const closePanels = () => {
    setLayersOpen(false);
    setViewOpen(false);
    setSettingsOpen(false);
  };

  if (!world || !heights) {
    return (
      <section className={`${styles.scene} ${styles.emptyScene}`} aria-label="3D terrain awaiting data">
        <div className={styles.emptyGrid} aria-hidden="true" />
        <div className={styles.emptyMark}>
          <ScanLine size={26} />
        </div>
        <span className="eyebrow">Operational twin / world pending</span>
        <h2>{scenario ? `Building ${scenario.name}` : 'No world committed'}</h2>
        <p>
          The terrain will render when the deterministic world artifact or a hash-fresh draft
          preview is available. The event ledger remains authoritative.
        </p>
      </section>
    );
  }

  const fallback = <SceneSchematic world={world} scenario={scenario} />;

  return (
    <section className={styles.scene} aria-label="Interactive 3D operational twin">
      <div className={styles.canvasWrap}>
        <SceneBoundary fallback={fallback}>
          <Scene3D
            world={world}
            heights={heights}
            scenario={scenario ?? scenarioFromWorld(world)}
            snapshot={snapshot}
            simulation={simulation}
            finalProposal={proposal}
            initialProposal={initialProposal}
            rejectedAssignments={rejectedAssignments}
            closedEdges={new Set(conditions?.closed_edge_ids ?? [])}
            preset={preset}
            quality={quality}
            lighting={lighting}
            layers={layers}
            selection={selection}
            onSelect={selectEntity}
            focusNonce={focusNonce}
            resetNonce={resetNonce}
            reduceMotion={reducedMotion}
            active={active}
          />
        </SceneBoundary>
      </div>

      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.frameCorners} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className={styles.sceneHeader}>
        <div className={styles.sourceRow}>
          <span className={`${styles.source} ${styles[`source_${source}`] ?? ''}`}>
            <span aria-hidden="true" />
            {source === 'committed' ? 'Committed world' : source === 'draft' ? 'Draft preview' : 'Fallback world'}
          </span>
          <span className={styles.presetTag}>
            {preset.name} · {quality}
          </span>
        </div>
        <h1>{world.title}</h1>
        <div className={styles.worldMeta}>
          <span>{world.districts.length} districts</span>
          <span>{world.assets.length} assets</span>
          <span>{world.demands.length} demands</span>
          <span>{shortHash(world.hash, 12)}</span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <button
          type="button"
          className={layersOpen ? styles.toolActive : styles.tool}
          onClick={() => {
            setLayersOpen((value) => !value);
            setViewOpen(false);
            setSettingsOpen(false);
          }}
          title="Scene layers"
          aria-expanded={layersOpen}
        >
          <Layers3 size={14} />
          <span>{selectedLayerCount}</span>
        </button>
        <button
          type="button"
          className={viewOpen ? styles.toolActive : styles.tool}
          onClick={() => {
            setViewOpen((value) => !value);
            setLayersOpen(false);
            setSettingsOpen(false);
          }}
          title="Rendering presets"
          aria-expanded={viewOpen}
        >
          <Eye size={14} />
        </button>
        <button
          type="button"
          className={settingsOpen ? styles.toolActive : styles.tool}
          onClick={() => {
            setSettingsOpen((value) => !value);
            setLayersOpen(false);
            setViewOpen(false);
          }}
          title="Scene quality and lighting"
          aria-expanded={settingsOpen}
        >
          <SlidersHorizontal size={14} />
        </button>
        <span className={styles.toolDivider} aria-hidden="true" />
        <button
          type="button"
          className={styles.tool}
          onClick={() => setResetNonce((value) => value + 1)}
          title="Reset camera"
        >
          <RotateCcw size={13} />
        </button>
        <button
          type="button"
          className={styles.tool}
          onClick={focusSelection}
          disabled={!selection?.position}
          title="Focus selected object"
        >
          <Focus size={13} />
        </button>
      </div>

      {layersOpen || viewOpen || settingsOpen ? (
        <>
          <button type="button" className={styles.popoverScrim} onClick={closePanels} aria-label="Close scene panel" />
          <div className={styles.popover}>
            {layersOpen ? (
              <>
                <div className={styles.popoverHead}>
                  <span>
                    <Layers3 size={11} /> Scene layers
                  </span>
                  <button type="button" onClick={closePanels} aria-label="Close layers">
                    <X size={11} />
                  </button>
                </div>
                <div className={styles.layerList}>
                  {LAYER_META.map((layer) => (
                    <div key={layer.key} className={styles.layerRow}>
                      <Toggle
                        checked={layers[layer.key]}
                        onChange={() => toggleLayer(layer.key)}
                        label={layer.label}
                        hint={layer.hint}
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {viewOpen ? (
              <>
                <div className={styles.popoverHead}>
                  <span>
                    <Eye size={11} /> Rendering preset
                  </span>
                  <button type="button" onClick={closePanels} aria-label="Close presets">
                    <X size={11} />
                  </button>
                </div>
                <div className={styles.viewGrid}>
                  {VIEW_PRESETS.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className={`${styles.viewCard} ${
                        candidate.id === viewPresetId ? styles.viewCardActive : ''
                      }`}
                      onClick={() => {
                        setViewPreset(candidate.id as ViewPresetId);
                        closePanels();
                      }}
                    >
                      <span
                        className={styles.viewSwatch}
                        style={{
                          background: `linear-gradient(135deg, ${candidate.palette.low}, ${candidate.palette.mid} 52%, ${candidate.palette.high})`,
                        }}
                      />
                      <span>
                        <strong>{candidate.name}</strong>
                        <small>{candidate.subtitle}</small>
                      </span>
                      {candidate.id === viewPresetId ? <ChevronRight size={11} /> : null}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {settingsOpen ? (
              <>
                <div className={styles.popoverHead}>
                  <span>
                    <SlidersHorizontal size={11} /> Scene output
                  </span>
                  <button type="button" onClick={closePanels} aria-label="Close scene settings">
                    <X size={11} />
                  </button>
                </div>
                <div className={styles.settingsBlock}>
                  <span>Quality</span>
                  <Segmented<QualityLevel>
                    label="Render quality"
                    value={quality}
                    onChange={setQuality}
                    options={[
                      { value: 'low', label: 'Low' },
                      { value: 'balanced', label: 'Balanced' },
                      { value: 'high', label: 'High' },
                    ]}
                  />
                  <small>Device pixel ratio {String(QUALITY_DPR[quality]).replace(',', '–')}</small>
                </div>
                <div className={styles.settingsBlock}>
                  <span>Lighting</span>
                  <Segmented
                    label="Scene lighting"
                    value={lighting}
                    onChange={setLighting}
                    options={[
                      { value: 'auto', label: 'Auto' },
                      { value: 'day', label: 'Day' },
                      { value: 'night', label: 'Night' },
                    ]}
                  />
                  <small>Auto follows the scenario start hour.</small>
                </div>
                <div className={styles.settingsBlock}>
                  <span>Reduced motion</span>
                  <strong className={reducedMotion ? styles.motionOn : styles.motionOff}>
                    {reducedMotion ? 'Honoured by system' : 'Not requested'}
                  </strong>
                  <small>Camera and reticle animation respect the OS preference.</small>
                </div>
              </>
            ) : null}
          </div>
        </>
      ) : null}

      <div className={styles.hazardRibbon}>
        <div>
          <span className={styles.hazardKind}>{titleCase(world.hazard.kind)}</span>
          <strong>
            {snapshot
              ? snapshot.hazard.summary
              : conditions
                ? conditions.summary
                : world.hazard.notes}
          </strong>
        </div>
        <div className={styles.hazardStats}>
          <span>
            STAGE
            <strong>
              {snapshot
                ? `${snapshot.hazard.water_level_m.toFixed(1)} m`
                : `${world.hazard.base_level_m.toFixed(1)} m`}
            </strong>
          </span>
          <span>
            CLOSED
            <strong>
              {snapshot?.roads.filter((road) => road.status === 'closed').length ??
                conditions?.closed_edge_ids.length ??
                '—'}
            </strong>
          </span>
          <span>
            VIS
            <strong>{scenario?.weather.visibility_km.toFixed(1) ?? '—'} km</strong>
          </span>
        </div>
      </div>

      {sceneFallbackNotice ? (
        <div className={styles.warning} role="status">
          <AlertTriangle size={12} />
          {sceneFallbackNotice}
        </div>
      ) : null}

      <div className={styles.legend}>
        <span>
          <i className={styles.legendRisk} /> Risk
        </span>
        <span>
          <i className={styles.legendValidated} /> Validated
        </span>
        <span>
          <i className={styles.legendProposed} /> Proposed
        </span>
        <span>
          <i className={styles.legendRejected} /> Rejected
        </span>
        <span>
          <i className={styles.legendBridge} /> Bridge
        </span>
      </div>

      <div className={styles.sceneFooterRight}>
        <div className={styles.compass} aria-label="North indicator">
          <span>N</span>
          <i />
        </div>
        <div className={styles.coordinates}>
          <span>37°12′N / 122°08′W</span>
          <span className={styles.synthetic}>SYNTHETIC · {world.algorithm_version}</span>
        </div>
      </div>

      {selection ? (
        <div className={styles.selectionCard}>
          <span className={styles.selectionKind}>{selection.kind}</span>
          <div>
            <strong>{selection.label}</strong>
            <p>{selection.detail ?? 'Typed evidence available in the inspector.'}</p>
          </div>
          <div className={styles.selectionActions}>
            {selection.position ? (
              <button type="button" onClick={focusSelection} title="Focus selected object">
                <Crosshair size={11} />
              </button>
            ) : null}
            <button type="button" onClick={() => selectEntity(null)} title="Clear selection">
              <X size={11} />
            </button>
          </div>
        </div>
      ) : null}

      {!snapshot && source === 'draft' ? (
        <div className={styles.draftBanner}>
          <Terminal size={11} />
          Draft terrain shown. Routes appear only after the workflow commits typed artifacts.
        </div>
      ) : null}

      <span className="sr-only">
        Rendered terrain for {world.title}. {formatPct(snapshot?.metrics.coverage_pct ?? null)} coverage
        at {formatMinutes(snapshot?.sim_time_min ?? 0)}.
      </span>
    </section>
  );
}

function scenarioFromWorld(world: World): ScenarioConfig {
  const fallback = {
    name: world.title,
    scenario_type: world.scenario_type,
    world_preset: world.preset,
    seed: world.seed,
    duration_minutes: 360,
    start_hour: 6,
    disruption_level: 0.5,
    affected_district_ids: [world.districts[0]?.id ?? 'D-0'],
    weather: {
      rainfall_mm_h: 0,
      wind_kph: 0,
      wind_dir_deg: 0,
      visibility_km: 10,
      terrain_saturation: 0,
    },
    resources: { rescue_teams: 0, medical_units: 0, supply_vehicles: 0, survey_drones: 0 },
    objectives: { coverage: 0.25, delivery: 0.25, response_time: 0.25, survey: 0.25 },
    execution_mode: 'deterministic' as const,
  };
  return fallback;
}

function SceneSchematic({
  world,
  scenario,
}: {
  world: World;
  scenario: ScenarioConfig | null;
}) {
  const size = 800;
  const scale = size / world.map_size_m;
  const point = (x: number, z: number) => `${x * scale},${z * scale}`;
  return (
    <div className={styles.schematic} role="img" aria-label="2D schematic fallback of the scenario map">
      <svg viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(125,190,209,0.09)" strokeWidth="1" />
          </pattern>
          <radialGradient id="risk" cx="42%" cy="50%" r="55%">
            <stop offset="0%" stopColor="rgba(255,90,110,0.18)" />
            <stop offset="100%" stopColor="rgba(255,90,110,0)" />
          </radialGradient>
        </defs>
        <rect width={size} height={size} fill="#07111b" />
        <rect width={size} height={size} fill="url(#grid)" />
        <rect width={size} height={size} fill="url(#risk)" />
        {world.districts.map((district) => (
          <polygon
            key={district.id}
            points={district.polygon.map(([x, z]) => point(x, z)).join(' ')}
            fill={scenario?.affected_district_ids.includes(district.id) ? 'rgba(255,179,92,0.07)' : 'rgba(79,216,255,0.02)'}
            stroke={scenario?.affected_district_ids.includes(district.id) ? 'rgba(255,179,92,0.5)' : 'rgba(125,190,209,0.2)'}
            strokeWidth="1"
          />
        ))}
        {world.edges.map((edge) => (
          <polyline
            key={edge.id}
            points={edge.polyline.map(([x, z]) => point(x, z)).join(' ')}
            fill="none"
            stroke={edge.bridge ? 'rgba(255,196,107,0.6)' : 'rgba(125,190,209,0.24)'}
            strokeWidth={edge.bridge ? 2 : 1}
          />
        ))}
        <polyline
          points={world.river.polyline.map(([x, z]) => point(x, z)).join(' ')}
          fill="none"
          stroke="rgba(79,216,255,0.5)"
          strokeWidth="8"
          opacity="0.4"
        />
        {world.assets.map((asset) => {
          const node = world.nodes.find((candidate) => candidate.id === asset.home_node_id);
          if (!node) return null;
          return (
            <circle
              key={asset.id}
              cx={node.x * scale}
              cy={node.z * scale}
              r="4"
              fill="#6ad9ff"
              stroke="#06101a"
              strokeWidth="1"
            />
          );
        })}
      </svg>
      <div className={styles.schematicNotice}>
        <Maximize2 size={13} />
        <div>
          <strong>3D context unavailable</strong>
          <p>
            The schematic preserves map geometry. Every operational value remains available in
            the inspector and report.
          </p>
        </div>
      </div>
    </div>
  );
}
