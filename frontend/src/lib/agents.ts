import type { AgentDescriptor, AgentId, RunEvent, RunStatus } from '../types';

export type AgentVisualStatus =
  | 'idle'
  | 'queued'
  | 'active'
  | 'completed'
  | 'failed'
  | 'needs_attention';

export interface AgentVisualState {
  id: string;
  status: AgentVisualStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number;
  calls: number;
  note: string;
  artifactHash: string;
}

export interface GanttInterval {
  id: string;
  agentId: string;
  startMs: number;
  endMs: number;
  startTs: string;
  endTs: string;
  calls: number;
}

export interface GanttModel {
  intervals: GanttInterval[];
  startMs: number;
  endMs: number;
  rows: Array<{ agentId: string; intervals: GanttInterval[] }>;
  branchesOverlap: boolean;
}

const TERMINAL: RunStatus[] = [
  'completed',
  'needs_attention',
  'failed',
  'cancelled',
  'interrupted',
];

export function isTerminalStatus(status: RunStatus | null | undefined): boolean {
  return Boolean(status && TERMINAL.includes(status));
}

function timeMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function deriveAgentStates(
  agents: AgentDescriptor[],
  events: RunEvent[],
  runStatus: RunStatus | null,
): Record<string, AgentVisualState> {
  const states: Record<string, AgentVisualState> = {};
  for (const agent of agents) {
    states[agent.id] = {
      id: agent.id,
      status: 'idle',
      startedAt: null,
      completedAt: null,
      durationMs: 0,
      calls: 0,
      note: '',
      artifactHash: '',
    };
  }
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  for (const event of ordered) {
    if (!event.agent_id) continue;
    const state = states[event.agent_id];
    if (!state) continue;
    if (event.type === 'agent.started') {
      state.status = 'active';
      state.startedAt = event.ts;
      state.completedAt = null;
    } else if (event.type === 'agent.completed') {
      state.status = event.status === 'failed' ? 'failed' : 'completed';
      state.completedAt = event.ts;
      state.durationMs =
        typeof event.payload.duration_ms === 'number'
          ? event.payload.duration_ms
          : Math.max(0, timeMs(event.ts) - timeMs(state.startedAt ?? event.ts));
      state.calls =
        typeof event.payload.calls === 'number' ? event.payload.calls : state.calls + 1;
      state.note = typeof event.payload.note === 'string' ? event.payload.note : '';
      state.artifactHash =
        typeof event.payload.artifact_hash === 'string' ? event.payload.artifact_hash : '';
    }
  }

  const director = states.director;
  if (director) {
    const runStarted = ordered.find((event) => event.type === 'run.started');
    const runTerminal = [...ordered]
      .reverse()
      .find((event) =>
        ['run.completed', 'run.needs_attention', 'run.failed', 'run.cancelled'].includes(
          event.type,
        ),
      );
    if (runStarted) {
      director.status = 'active';
      director.startedAt = runStarted.ts;
    }
    if (runTerminal) {
      director.status =
        runTerminal.type === 'run.failed'
          ? 'failed'
          : runTerminal.type === 'run.needs_attention'
            ? 'needs_attention'
            : 'completed';
      director.completedAt = runTerminal.ts;
      director.durationMs = Math.max(
        0,
        timeMs(runTerminal.ts) - timeMs(runStarted?.ts ?? runTerminal.ts),
      );
    } else if (runStatus && TERMINAL.includes(runStatus)) {
      director.status = runStatus === 'failed' ? 'failed' : 'completed';
    }
  }

  for (const state of Object.values(states)) {
    if (state.status === 'active' && runStatus && TERMINAL.includes(runStatus)) {
      state.status = runStatus === 'failed' ? 'failed' : 'completed';
    }
  }
  return states;
}

export interface BuildGanttOptions {
  runStatus?: RunStatus | null;
}

export function buildGantt(
  agents: AgentDescriptor[],
  events: RunEvent[],
  options: BuildGanttOptions = {},
): GanttModel {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const open = new Map<string, GanttInterval>();
  const intervals: GanttInterval[] = [];
  let lastMs = 0;

  const openInterval = (agentId: string, event: RunEvent) => {
    const startMs = timeMs(event.ts) || lastMs;
    const interval: GanttInterval = {
      id: `${agentId}-${event.seq}`,
      agentId,
      startMs,
      endMs: startMs,
      startTs: event.ts,
      endTs: event.ts,
      calls: 1,
    };
    open.set(agentId, interval);
    intervals.push(interval);
    lastMs = Math.max(lastMs, startMs);
  };

  const closeInterval = (agentId: string, event: RunEvent, calls = 1) => {
    const endMs = timeMs(event.ts) || lastMs;
    const interval = open.get(agentId);
    if (interval) {
      interval.endMs = Math.max(interval.startMs + 1, endMs);
      interval.endTs = event.ts;
      interval.calls = calls;
      open.delete(agentId);
    }
    lastMs = Math.max(lastMs, endMs);
  };

  for (const event of ordered) {
    if (event.type === 'agent.started' && event.agent_id) {
      openInterval(event.agent_id, event);
    } else if (event.type === 'agent.completed' && event.agent_id) {
      closeInterval(
        event.agent_id,
        event,
        typeof event.payload.calls === 'number' ? event.payload.calls : 1,
      );
    } else if (event.type === 'run.started') {
      openInterval('director', event);
    } else if (
      ['run.completed', 'run.needs_attention', 'run.failed', 'run.cancelled'].includes(event.type)
    ) {
      closeInterval('director', event);
    }
  }

  const terminal = options.runStatus && TERMINAL.includes(options.runStatus);
  if (terminal) {
    const lastEventMs = ordered.length ? timeMs(ordered[ordered.length - 1].ts) : Date.now();
    for (const interval of open.values()) {
      interval.endMs = Math.max(interval.startMs + 1, lastEventMs);
      interval.endTs = ordered[ordered.length - 1]?.ts ?? interval.startTs;
    }
    open.clear();
  }
  if (!intervals.length) {
    const now = Date.now();
    intervals.push({
      id: 'empty',
      agentId: 'director',
      startMs: now,
      endMs: now + 1,
      startTs: new Date(now).toISOString(),
      endTs: new Date(now + 1).toISOString(),
      calls: 0,
    });
  }

  const startMs = Math.min(...intervals.map((interval) => interval.startMs));
  const endMs = Math.max(...intervals.map((interval) => interval.endMs), startMs + 1);
  const rows = agents.map((agent) => ({
    agentId: agent.id,
    intervals: intervals
      .filter((interval) => interval.agentId === agent.id)
      .sort((a, b) => a.startMs - b.startMs),
  }));

  const branches = ['conditions', 'resources', 'access'];
  const branchesOverlap = (() => {
    for (const interval of intervals) {
      if (!branches.includes(interval.agentId)) continue;
      const others = intervals.filter(
        (candidate) =>
          candidate !== interval &&
          branches.includes(candidate.agentId) &&
          candidate.startMs < interval.endMs &&
          candidate.endMs > interval.startMs,
      );
      if (others.length >= 2) return true;
    }
    return false;
  })();

  return { intervals, startMs, endMs, rows, branchesOverlap };
}

export function eventTone(type: string): string {
  if (type.startsWith('verification')) return 'warning';
  if (type === 'run.failed' || type === 'run.cancelled') return 'danger';
  if (type === 'run.completed') return 'success';
  if (type === 'run.needs_attention') return 'attention';
  if (type === 'revision.started' || type === 'revision.completed') return 'revision';
  if (type.startsWith('agent')) return 'agent';
  if (type.startsWith('artifact')) return 'artifact';
  return 'default';
}

export function eventSummary(event: RunEvent): string {
  const payload = event.payload;
  switch (event.type) {
    case 'run.queued':
      return 'Scenario accepted into the execution queue.';
    case 'run.started':
      return 'Real ADK workflow started; deterministic policy mode.';
    case 'run.committed':
      return 'Commit gate opened after preflight and outcome verification.';
    case 'run.completed':
      return 'Run completed with a validated simulation.';
    case 'run.needs_attention':
      return 'Run completed without full validation; review findings.';
    case 'run.failed':
      return typeof payload.message === 'string' ? payload.message : 'Run failed.';
    case 'run.cancelled':
      return 'Run cancelled by the operator.';
    case 'join.completed':
      return 'Parallel Conditions, Resources, and Accessibility branches joined.';
    case 'agent.started':
      return typeof payload.name === 'string' ? `${payload.name} started.` : 'Agent started.';
    case 'agent.completed': {
      const name = typeof payload.name === 'string' ? payload.name : event.agent_id ?? 'Agent';
      const ms = typeof payload.duration_ms === 'number' ? `${payload.duration_ms} ms` : '';
      return `${name} completed${ms ? ` in ${ms}` : ''}.`;
    }
    case 'artifact.created': {
      const kind = typeof payload.kind === 'string' ? payload.kind : 'artifact';
      const summary = payload.summary as Record<string, unknown> | undefined;
      const hash = typeof summary?.hash === 'string' ? summary.hash.slice(0, 10) : '';
      return `${kind} artifact committed${hash ? ` · ${hash}` : ''}.`;
    }
    case 'verification.finding': {
      const code = typeof payload.code === 'string' ? payload.code : 'FINDING';
      const severity = typeof payload.severity === 'string' ? payload.severity : '';
      return `${severity.toUpperCase()} ${code}`;
    }
    case 'revision.started': {
      const codes = Array.isArray(payload.codes) ? payload.codes.join(' · ') : 'repair';
      return `Bounded revision ${String(payload.attempt ?? '')} triggered by ${codes}.`;
    }
    case 'revision.completed': {
      const changed = typeof payload.assignments_changed === 'number' ? payload.assignments_changed : 0;
      return `Revision repaired ${changed} assignment${changed === 1 ? '' : 's'}.`;
    }
    default:
      return event.type;
  }
}

export function agentLabel(id: string, agents: AgentDescriptor[]): string {
  return agents.find((agent) => agent.id === id)?.name ?? id;
}

export type AgentIdUnion = AgentId;
