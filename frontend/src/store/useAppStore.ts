import { create } from 'zustand';

import {
  ApiError,
  cancelRun as apiCancelRun,
  createRun,
  getAgents,
  getMeta,
  getPresets,
  getRun,
  getRunBundle,
  getRunEvents,
  getRuns,
  previewWorld,
  streamUrl,
} from '../lib/api';
import { isTerminalStatus } from '../lib/agents';
import { scenarioSignature, validateScenario } from '../lib/scenario';
import type { ViewPresetId, QualityLevel } from '../lib/viewPresets';
import { DEFAULT_VIEW_PRESET } from '../lib/viewPresets';
import type {
  AgentDescriptor,
  AllocationProposal,
  Artifacts,
  Assignment,
  Finding,
  FinalReport,
  MetaResponse,
  PresetInfo,
  PreviewResponse,
  RunBundle,
  RunEvent,
  RunRecord,
  ScenarioConfig,
  SimulationResult,
  Snapshot,
  World,
} from '../types';

export type Screen = 'launch' | 'command';
export type LoadState = 'idle' | 'loading' | 'ready' | 'error';
export type StreamState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'closed' | 'error';
export type InspectorTab = 'findings' | 'events' | 'detail';
export type ModalId = 'agents' | 'gantt' | 'report' | null;
export type SceneSource = 'draft' | 'committed' | 'fallback' | 'none';

export interface EntitySelection {
  kind:
    | 'asset'
    | 'facility'
    | 'district'
    | 'route'
    | 'finding'
    | 'event'
    | 'agent'
    | 'demand'
    | 'bridge'
    | 'edge';
  id: string;
  label: string;
  detail?: string;
  position?: [number, number, number];
}

export interface LayerState {
  risk: boolean;
  coverage: boolean;
  routes: boolean;
  proposed: boolean;
  trails: boolean;
  assets: boolean;
  facilities: boolean;
  labels: boolean;
  weather: boolean;
  districts: boolean;
}

interface AppState {
  bootState: LoadState;
  bootError: string | null;
  meta: MetaResponse | null;
  presets: PresetInfo[];
  agents: AgentDescriptor[];
  recentRuns: RunRecord[];
  screen: Screen;
  builderOpen: boolean;
  draft: ScenarioConfig | null;
  selectedPresetId: string | null;
  preview: PreviewResponse | null;
  previewFor: string | null;
  previewState: LoadState;
  previewError: string | null;
  starting: boolean;
  activeRunId: string | null;
  run: RunRecord | null;
  events: RunEvent[];
  bundle: RunBundle | null;
  artifacts: Artifacts;
  reportMarkdown: string;
  lastValidatedBundle: RunBundle | null;
  streamState: StreamState;
  runError: string | null;
  connectionError: string | null;
  sceneFallbackNotice: string | null;
  selectedTick: number;
  playing: boolean;
  playbackSpeed: number;
  viewPreset: ViewPresetId;
  quality: QualityLevel;
  lighting: 'auto' | 'day' | 'night';
  layers: LayerState;
  inspectorTab: InspectorTab;
  selection: EntitySelection | null;
  focusNonce: number;
  modal: ModalId;
  toast: string | null;
  loadRun: (runId: string) => Promise<void>;
  initialize: () => Promise<void>;
  refreshRecentRuns: () => Promise<void>;
  openBuilder: () => void;
  closeBuilder: () => void;
  choosePreset: (presetId: string) => void;
  patchDraft: (patch: Partial<ScenarioConfig>) => void;
  patchWeather: (patch: Partial<ScenarioConfig['weather']>) => void;
  patchResources: (patch: Partial<ScenarioConfig['resources']>) => void;
  patchObjectives: (patch: Partial<ScenarioConfig['objectives']>) => void;
  toggleAffectedDistrict: (districtId: string) => void;
  requestPreview: () => void;
  startRun: () => Promise<void>;
  cancelCurrentRun: () => Promise<void>;
  returnToLaunch: () => void;
  setSelectedTick: (tick: number) => void;
  setPlaying: (playing: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  setViewPreset: (preset: ViewPresetId) => void;
  setQuality: (quality: QualityLevel) => void;
  setLighting: (lighting: 'auto' | 'day' | 'night') => void;
  toggleLayer: (key: keyof LayerState) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  selectEntity: (selection: EntitySelection | null) => void;
  focusSelection: () => void;
  setModal: (modal: ModalId) => void;
  setToast: (toast: string | null) => void;
  restoreLastValidated: () => void;
}

let eventSource: EventSource | null = null;
let reconnectTimer: number | null = null;
let pollTimer: number | null = null;
let bundleTimer: number | null = null;
let previewTimer: number | null = null;
let previewController: AbortController | null = null;
let activeStreamKey = '';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.details.length ? `${error.message} ${error.details.join(' ')}` : error.message;
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}

function closeStream(): void {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  if (bundleTimer !== null) {
    window.clearTimeout(bundleTimer);
    bundleTimer = null;
  }
  activeStreamKey = '';
}

function normalizeArtifacts(raw: Record<string, unknown>): Artifacts {
  return raw as unknown as Artifacts;
}

export function firstProposalFromEvents(events: RunEvent[]): AllocationProposal | null {
  for (const event of events) {
    if (event.type !== 'artifact.created') continue;
    if (event.payload.kind !== 'proposal') continue;
    const summary = event.payload.summary as Record<string, unknown> | undefined;
    if (!summary) continue;
    return {
      id: String(summary.id ?? 'proposal'),
      assignments: (summary.assignments as Assignment[]) ?? [],
      unassigned: (summary.unassigned as AllocationProposal['unassigned']) ?? [],
      assumptions: [],
      mode: 'deterministic',
      revision: Number(summary.revision ?? 0),
      hash: String(summary.hash ?? ''),
    };
  }
  return null;
}

function latestSnapshot(bundle: RunBundle | null): Snapshot | null {
  const simulation = bundle?.artifacts.simulation as SimulationResult | undefined;
  if (!simulation?.snapshots?.length) return null;
  return simulation.snapshots[simulation.snapshots.length - 1];
}

function hashCompare(bundle: RunBundle | null): string | null {
  if (!bundle) return null;
  const world = bundle.artifacts.world as World | undefined;
  const expected = bundle.run.world_hash;
  if (world && expected && world.hash !== expected) {
    return 'Committed world hash does not match the run manifest. Treat the scene as stale.';
  }
  return null;
}

function applyBundleToState(
  set: (partial: Partial<AppState>) => void,
  bundle: RunBundle,
): void {
  const artifacts = normalizeArtifacts(bundle.artifacts);
  const report = (bundle.report ?? artifacts.report) as FinalReport | null;
  const simulation = artifacts.simulation;
  const hashWarning = hashCompare(bundle);
  const snapshot = latestSnapshot(bundle);
  set({
    bundle,
    artifacts,
    run: bundle.run,
    reportMarkdown: bundle.report_markdown || report?.markdown || '',
    runError: bundle.run.error,
    sceneFallbackNotice: hashWarning,
    selectedTick: snapshot ? snapshot.tick : 0,
  });
  if (simulation && report) {
    set({ lastValidatedBundle: bundle });
  }
}

function terminalStatus(status: string): boolean {
  return ['completed', 'needs_attention', 'failed', 'cancelled', 'interrupted'].includes(status);
}

export const useAppStore = create<AppState>((set, get) => {
  const scheduleBundleRefresh = () => {
    if (bundleTimer !== null) window.clearTimeout(bundleTimer);
    bundleTimer = window.setTimeout(() => {
      bundleTimer = null;
      void refreshBundle();
    }, 180);
  };

  const refreshBundle = async (): Promise<void> => {
    const runId = get().activeRunId;
    if (!runId) return;
    try {
      const bundle = await getRunBundle(runId);
      if (get().activeRunId !== runId) return;
      applyBundleToState(set, bundle);
      if (terminalStatus(bundle.run.status)) {
        set({ streamState: 'closed' });
      }
    } catch (error) {
      if ((error as ApiError)?.status !== 409) {
        set({ connectionError: errorMessage(error) });
      }
    }
  };

  const refreshRun = async (): Promise<RunRecord | null> => {
    const runId = get().activeRunId;
    if (!runId) return null;
    try {
      const run = await getRun(runId);
      if (get().activeRunId !== runId) return null;
      set({
        run,
        connectionError: null,
        runError: run.error,
      });
      if (terminalStatus(run.status)) {
        set({ streamState: 'closed' });
      }
      return run;
    } catch (error) {
      set({ connectionError: errorMessage(error) });
      return null;
    }
  };

  const finishTerminal = async (): Promise<void> => {
    const runId = get().activeRunId;
    if (!runId) return;
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    eventSource?.close();
    eventSource = null;
    await refreshRun();
    await refreshBundle();
    const snapshot = latestSnapshot(get().bundle);
    if (snapshot) {
      set({ selectedTick: snapshot.tick, playing: false });
    }
    set({ streamState: 'closed' });
    void get().refreshRecentRuns();
  };

  const handleEvent = (event: RunEvent): void => {
    if (event.run_id !== get().activeRunId) return;
    const existing = get().events;
    if (existing.some((candidate) => candidate.seq === event.seq)) return;
    const events = [...existing, event].sort((a, b) => a.seq - b.seq);
    const next: Partial<AppState> = { events };
    if (event.agent_id && event.type === 'agent.started') {
      next.run = get().run ? { ...get().run!, current_agent: event.agent_id } : null;
    }
    if (event.type === 'run.failed') {
      next.runError = typeof event.payload.message === 'string' ? event.payload.message : 'Run failed.';
    }
    if (
      ['run.completed', 'run.needs_attention', 'run.failed', 'run.cancelled'].includes(event.type)
    ) {
      const status =
        event.type === 'run.completed'
          ? 'completed'
          : event.type === 'run.needs_attention'
            ? 'needs_attention'
            : event.type === 'run.cancelled'
              ? 'cancelled'
              : 'failed';
      next.run = get().run ? { ...get().run!, status } : null;
      next.streamState = 'closed';
    }
    set(next);
    if (event.type === 'artifact.created') {
      scheduleBundleRefresh();
    }
    if (
      ['run.completed', 'run.needs_attention', 'run.failed', 'run.cancelled'].includes(event.type)
    ) {
      void finishTerminal();
    }
  };

  const connectStream = (): void => {
    const runId = get().activeRunId;
    if (!runId || terminalStatus(get().run?.status ?? '')) return;
    if (activeStreamKey === runId && eventSource && eventSource.readyState !== EventSource.CLOSED) {
      return;
    }
    eventSource?.close();
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    const after = get().events.reduce((max, event) => Math.max(max, event.seq), 0);
    const nextSource = new EventSource(streamUrl(runId, after));
    eventSource = nextSource;
    activeStreamKey = runId;
    set({ streamState: 'connecting' });
    nextSource.onopen = () => {
      if (get().activeRunId === runId) set({ streamState: 'live', connectionError: null });
    };
    nextSource.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as RunEvent;
        handleEvent(event);
      } catch {
        set({ connectionError: 'The event stream returned a malformed event.' });
      }
    };
    nextSource.onerror = () => {
      nextSource.close();
      if (eventSource === nextSource) eventSource = null;
      if (get().activeRunId !== runId) return;
      if (terminalStatus(get().run?.status ?? '')) return;
      set({ streamState: 'reconnecting' });
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        if (get().activeRunId === runId) connectStream();
      }, 1600);
    };
  };

  const startPolling = (): void => {
    if (pollTimer !== null) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(() => {
      void (async () => {
        const run = await refreshRun();
        if (!run) return;
        if (terminalStatus(run.status)) {
          if (pollTimer !== null) {
            window.clearInterval(pollTimer);
            pollTimer = null;
          }
          await finishTerminal();
        }
      })();
    }, 1800);
  };

  const requestPreviewNow = async (scenario: ScenarioConfig): Promise<PreviewResponse | null> => {
    previewController?.abort();
    const controller = new AbortController();
    previewController = controller;
    set({ previewState: 'loading', previewError: null });
    try {
      const preview = await previewWorld(scenario, controller.signal);
      if (controller.signal.aborted) return null;
      if (scenarioSignature(get().draft ?? scenario) !== scenarioSignature(scenario)) {
        return null;
      }
      set({
        preview,
        previewState: 'ready',
        previewFor: scenarioSignature(scenario),
        previewError: null,
      });
      return preview;
    } catch (error) {
      if (controller.signal.aborted) return null;
      set({
        previewState: 'error',
        previewError: errorMessage(error),
        preview: null,
        previewFor: null,
      });
      return null;
    }
  };

  return {
    bootState: 'loading',
    bootError: null,
    meta: null,
    presets: [],
    agents: [],
    recentRuns: [],
    screen: 'launch',
    builderOpen: false,
    draft: null,
    selectedPresetId: null,
    preview: null,
    previewFor: null,
    previewState: 'idle',
    previewError: null,
    starting: false,
    activeRunId: null,
    run: null,
    events: [],
    bundle: null,
    artifacts: {},
    reportMarkdown: '',
    lastValidatedBundle: null,
    streamState: 'idle',
    runError: null,
    connectionError: null,
    sceneFallbackNotice: null,
    selectedTick: 0,
    playing: false,
    playbackSpeed: 1,
    viewPreset: DEFAULT_VIEW_PRESET,
    quality: 'balanced',
    lighting: 'auto',
    layers: {
      risk: true,
      coverage: false,
      routes: true,
      proposed: true,
      trails: true,
      assets: true,
      facilities: true,
      labels: true,
      weather: true,
      districts: true,
    },
    inspectorTab: 'findings',
    selection: null,
    focusNonce: 0,
    modal: null,
    toast: null,

    initialize: async () => {
      set({ bootState: 'loading', bootError: null });
      try {
        const [meta, presets, agents, recentRuns] = await Promise.all([
          getMeta(),
          getPresets(),
          getAgents(),
          getRuns(8),
        ]);
        const draft = structuredClone(presets[0]?.scenario ?? null);
        set({
          meta,
          presets,
          agents,
          recentRuns,
          draft,
          selectedPresetId: presets[0]?.id ?? null,
          bootState: 'ready',
        });
      } catch (error) {
        set({ bootState: 'error', bootError: errorMessage(error) });
      }
    },

    refreshRecentRuns: async () => {
      try {
        const recentRuns = await getRuns(8);
        set({ recentRuns });
      } catch {
        // Recent history is non-critical; the active run stays authoritative.
      }
    },

    loadRun: async (runId: string) => {
      closeStream();
      set({
        screen: 'command',
        builderOpen: false,
        activeRunId: runId,
        run: null,
        events: [],
        bundle: null,
        artifacts: {},
        reportMarkdown: '',
        runError: null,
        connectionError: null,
        sceneFallbackNotice: null,
        selectedTick: 0,
        playing: false,
        streamState: 'connecting',
        selection: null,
      });
      try {
        const run = await getRun(runId);
        set({ run, draft: structuredClone(run.scenario) });
        const events = await getRunEvents(runId);
        set({ events });
        if (!terminalStatus(run.status)) {
          const preview = await requestPreviewNow(run.scenario);
          if (preview) set({ preview });
        }
        await refreshBundle();
        if (terminalStatus(run.status)) {
          set({ streamState: 'closed' });
        } else {
          connectStream();
          startPolling();
        }
      } catch (error) {
        set({ streamState: 'error', runError: errorMessage(error) });
      }
    },

    openBuilder: () => {
      set({ builderOpen: true });
      const draft = get().draft;
      if (draft && get().previewFor !== scenarioSignature(draft)) {
        get().requestPreview();
      }
    },
    closeBuilder: () => set({ builderOpen: false }),

    choosePreset: (presetId: string) => {
      const preset = get().presets.find((candidate) => candidate.id === presetId);
      if (!preset) return;
      set({
        draft: structuredClone(preset.scenario),
        selectedPresetId: preset.id,
        preview: null,
        previewFor: null,
        previewError: null,
      });
      if (get().builderOpen) get().requestPreview();
    },

    patchDraft: (patch: Partial<ScenarioConfig>) => {
      const draft = get().draft;
      if (!draft) return;
      set({ draft: { ...draft, ...patch } });
      if (get().builderOpen) get().requestPreview();
    },
    patchWeather: (patch: Partial<ScenarioConfig['weather']>) => {
      const draft = get().draft;
      if (!draft) return;
      set({ draft: { ...draft, weather: { ...draft.weather, ...patch } } });
      if (get().builderOpen) get().requestPreview();
    },
    patchResources: (patch: Partial<ScenarioConfig['resources']>) => {
      const draft = get().draft;
      if (!draft) return;
      set({ draft: { ...draft, resources: { ...draft.resources, ...patch } } });
      if (get().builderOpen) get().requestPreview();
    },
    patchObjectives: (patch: Partial<ScenarioConfig['objectives']>) => {
      const draft = get().draft;
      if (!draft) return;
      set({ draft: { ...draft, objectives: { ...draft.objectives, ...patch } } });
      if (get().builderOpen) get().requestPreview();
    },
    toggleAffectedDistrict: (districtId: string) => {
      const draft = get().draft;
      if (!draft) return;
      const selected = draft.affected_district_ids.includes(districtId);
      const next = selected
        ? draft.affected_district_ids.filter((id) => id !== districtId)
        : [...draft.affected_district_ids, districtId];
      set({ draft: { ...draft, affected_district_ids: next } });
      if (get().builderOpen) get().requestPreview();
    },

    requestPreview: () => {
      const draft = get().draft;
      if (!draft) return;
      previewController?.abort();
      const validation = validateScenario(draft);
      if (!validation.ok) {
        set({ previewState: 'error', previewError: validation.errors[0] ?? 'Invalid scenario.' });
        return;
      }
      if (previewTimer !== null) window.clearTimeout(previewTimer);
      set({ previewState: 'loading', previewError: null });
      previewTimer = window.setTimeout(() => {
        previewTimer = null;
        void requestPreviewNow(draft);
      }, 360);
    },

    startRun: async () => {
      const draft = get().draft;
      if (!draft) return;
      const validation = validateScenario(draft);
      if (!validation.ok) {
        set({ previewError: validation.errors[0] ?? 'Invalid scenario.', toast: validation.errors[0] });
        return;
      }
      set({ starting: true, runError: null, connectionError: null });
      try {
        let preview = get().preview;
        let previewFor = get().previewFor;
        if (!preview || previewFor !== scenarioSignature(draft)) {
          preview = await requestPreviewNow(draft);
          previewFor = get().previewFor;
        }
        if (!preview) throw new Error(get().previewError ?? 'Draft world preview failed.');
        const created = await createRun(draft, preview.world.hash);
        closeStream();
        set({
          screen: 'command',
          builderOpen: false,
          activeRunId: created.run_id,
          run: null,
          events: [],
          bundle: null,
          artifacts: {},
          reportMarkdown: '',
          runError: null,
          connectionError: null,
          sceneFallbackNotice: null,
          selectedTick: 0,
          playing: false,
          streamState: 'connecting',
          selection: null,
          inspectorTab: 'findings',
          previewState: 'ready',
          starting: false,
        });
        await refreshRun();
        connectStream();
        startPolling();
        void get().refreshRecentRuns();
      } catch (error) {
        const message = errorMessage(error);
        set({ starting: false, runError: message, streamState: 'error', toast: message });
      }
    },

    cancelCurrentRun: async () => {
      const runId = get().activeRunId;
      if (!runId) return;
      try {
        await apiCancelRun(runId);
        set({ toast: 'Cancellation requested. Waiting for the server to settle.' });
        await refreshRun();
      } catch (error) {
        set({ toast: errorMessage(error) });
      }
    },

    returnToLaunch: () => {
      closeStream();
      set({
        screen: 'launch',
        activeRunId: null,
        run: null,
        events: [],
        bundle: null,
        artifacts: {},
        reportMarkdown: '',
        runError: null,
        connectionError: null,
        streamState: 'idle',
        selectedTick: 0,
        playing: false,
        selection: null,
        modal: null,
      });
      void get().refreshRecentRuns();
    },

    setSelectedTick: (tick: number) => {
      const simulation = get().artifacts.simulation;
      const max = simulation?.snapshots?.length
        ? simulation.snapshots[simulation.snapshots.length - 1].tick
        : 0;
      set({ selectedTick: Math.max(0, Math.min(max, Math.round(tick))) });
    },
    setPlaying: (playing: boolean) => set({ playing }),
    setPlaybackSpeed: (speed: number) => set({ playbackSpeed: speed }),
    setViewPreset: (preset: ViewPresetId) => set({ viewPreset: preset }),
    setQuality: (quality: QualityLevel) => set({ quality }),
    setLighting: (lighting: 'auto' | 'day' | 'night') => set({ lighting }),
    toggleLayer: (key: keyof LayerState) =>
      set((state) => ({ layers: { ...state.layers, [key]: !state.layers[key] } })),
    setInspectorTab: (tab: InspectorTab) => set({ inspectorTab: tab }),
    selectEntity: (selection: EntitySelection | null) =>
      set({
        selection,
        inspectorTab: selection ? 'detail' : get().inspectorTab,
      }),
    focusSelection: () => set((state) => ({ focusNonce: state.focusNonce + 1 })),
    setModal: (modal: ModalId) => set({ modal }),
    setToast: (toast: string | null) => set({ toast }),
    restoreLastValidated: () => {
      const fallback = get().lastValidatedBundle;
      if (!fallback) return;
      applyBundleToState(set, fallback);
      set({
        screen: 'command',
        activeRunId: fallback.run.id,
        sceneFallbackNotice: 'Showing the last validated scene; the failed run remains in history.',
      });
    },
  };
});

export function selectWorld(state: AppState): World | null {
  const artifacts = state.artifacts;
  if (artifacts.world) return artifacts.world;
  if (state.preview?.world) return state.preview.world;
  if (state.lastValidatedBundle) {
    return (state.lastValidatedBundle.artifacts.world as World | undefined) ?? null;
  }
  return null;
}

export function selectSceneSource(state: AppState): SceneSource {
  if (state.artifacts.world) return 'committed';
  if (state.preview?.world) return 'draft';
  if (state.lastValidatedBundle) return 'fallback';
  return 'none';
}

export function selectSnapshot(state: AppState): Snapshot | null {
  const simulation = state.artifacts.simulation;
  if (!simulation?.snapshots?.length) return null;
  return (
    simulation.snapshots.find((snapshot) => snapshot.tick === state.selectedTick) ??
    simulation.snapshots[simulation.snapshots.length - 1]
  );
}

export function selectSimulation(state: AppState): SimulationResult | null {
  return state.artifacts.simulation ?? null;
}

export function selectReport(state: AppState): FinalReport | null {
  return state.artifacts.report ?? state.bundle?.report ?? null;
}

const EMPTY_FINDINGS: Finding[] = [];
let findingsCache:
  | {
      preflight: Finding[] | undefined;
      outcome: Finding[] | undefined;
      value: Finding[];
    }
  | null = null;

export function selectFindings(state: AppState): Finding[] {
  const report = selectReport(state);
  if (report?.findings?.length) return report.findings;
  const preflight = state.artifacts.preflight?.findings;
  const outcome = state.artifacts.outcome?.findings;
  if (!preflight?.length && !outcome?.length) return EMPTY_FINDINGS;
  if (
    findingsCache &&
    findingsCache.preflight === preflight &&
    findingsCache.outcome === outcome
  ) {
    return findingsCache.value;
  }
  const value = [...(preflight ?? []), ...(outcome ?? [])];
  findingsCache = { preflight, outcome, value };
  return value;
}

let proposalCache: { events: RunEvent[]; proposal: AllocationProposal | null } | null = null;

export function selectInitialProposal(state: AppState): AllocationProposal | null {
  if (proposalCache?.events === state.events) return proposalCache.proposal;
  const proposal = firstProposalFromEvents(state.events);
  proposalCache = { events: state.events, proposal };
  return proposal;
}

const affectedCache = new WeakMap<Finding[], Set<string>>();
const EMPTY_AFFECTED = new Set<string>();

export function affectedAssignmentIds(source: Finding[]): Set<string> {
  if (!source.length) return EMPTY_AFFECTED;
  const cached = affectedCache.get(source);
  if (cached) return cached;
  const ids = new Set<string>();
  for (const finding of source) {
    if (finding.severity !== 'error') continue;
    if (finding.code === 'TIME_WINDOW_OVERLAP' || finding.code === 'ROUTE_BLOCKED') {
      for (const entityId of finding.entity_ids) {
        if (entityId.startsWith('ASG-')) ids.add(entityId);
      }
    }
  }
  affectedCache.set(source, ids);
  return ids;
}

export function selectAffectedAssignments(state: AppState): Set<string> {
  const source = isTerminalStatus(state.run?.status)
    ? selectFindings(state)
    : state.artifacts.preflight?.findings ?? EMPTY_FINDINGS;
  return affectedAssignmentIds(source);
}

export function selectActiveAgentId(state: AppState): string | null {
  return state.run?.current_agent ?? null;
}

export function selectPreviewFresh(state: AppState): boolean {
  return Boolean(
    state.draft &&
      state.previewFor &&
      state.previewFor === scenarioSignature(state.draft) &&
      state.preview?.world,
  );
}
