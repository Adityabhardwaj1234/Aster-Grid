import { describe, expect, it } from 'vitest';

import type { AgentDescriptor, RunEvent } from '../types';
import {
  buildGantt,
  deriveAgentStates,
  eventSummary,
  eventTone,
  isTerminalStatus,
} from './agents';

const agents: AgentDescriptor[] = [
  { id: 'director', name: 'Director', role: 'Schedules', mode: 'deterministic', depends_on: [] },
  { id: 'conditions', name: 'Conditions', role: 'Hazard', mode: 'deterministic', depends_on: [] },
  { id: 'resources', name: 'Resources', role: 'Allocation', mode: 'deterministic', depends_on: [] },
  { id: 'access', name: 'Access', role: 'Routing', mode: 'deterministic', depends_on: [] },
];

let seq = 0;
function event(
  type: string,
  ts: string,
  agentId: string | null,
  payload: Record<string, unknown> = {},
  status: string | null = null,
): RunEvent {
  seq += 1;
  return {
    event_id: `evt-${seq}`,
    run_id: 'run-test',
    seq,
    type,
    ts,
    agent_id: agentId,
    status,
    payload,
  };
}

describe('agent visual state', () => {
  it('marks terminal statuses explicitly', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('running')).toBe(false);
    expect(isTerminalStatus(null)).toBe(false);
  });

  it('derives durations, calls, and artifact hashes from events', () => {
    seq = 0;
    const events = [
      event('run.started', '2026-10-25T10:00:00.000Z', null),
      event('agent.started', '2026-10-25T10:00:00.100Z', 'conditions'),
      event(
        'agent.completed',
        '2026-10-25T10:00:00.300Z',
        'conditions',
        { duration_ms: 200, calls: 2, note: 'closed edges', artifact_hash: 'abc123' },
        'completed',
      ),
      event('run.completed', '2026-10-25T10:00:01.300Z', null),
    ];
    const states = deriveAgentStates(agents, events, 'completed');
    expect(states.conditions.status).toBe('completed');
    expect(states.conditions.durationMs).toBe(200);
    expect(states.conditions.calls).toBe(2);
    expect(states.conditions.artifactHash).toBe('abc123');
    expect(states.director.status).toBe('completed');
    expect(states.director.durationMs).toBe(1300);
    expect(states.resources.status).toBe('idle');
  });

  it('does not leave active agents when a terminal status arrives', () => {
    seq = 0;
    const states = deriveAgentStates(
      agents,
      [event('agent.started', '2026-10-25T10:00:00.000Z', 'resources')],
      'failed',
    );
    expect(states.director.status).toBe('failed');
    expect(states.resources.status).toBe('failed');
  });
});

describe('execution Gantt', () => {
  it('detects genuine three-way branch overlap', () => {
    seq = 0;
    const events = [
      event('agent.started', '2026-10-25T10:00:00.000Z', 'conditions'),
      event('agent.started', '2026-10-25T10:00:00.050Z', 'resources'),
      event('agent.started', '2026-10-25T10:00:00.100Z', 'access'),
      event('agent.completed', '2026-10-25T10:00:00.200Z', 'resources'),
      event('agent.completed', '2026-10-25T10:00:00.210Z', 'conditions'),
      event('agent.completed', '2026-10-25T10:00:00.220Z', 'access'),
    ];
    const model = buildGantt(agents, events, { runStatus: 'completed' });
    expect(model.branchesOverlap).toBe(true);
    expect(model.intervals).toHaveLength(3);
    expect(model.rows.find((row) => row.agentId === 'conditions')?.intervals).toHaveLength(1);
    expect(model.endMs).toBeGreaterThan(model.startMs);
  });

  it('does not claim overlap for sequential branches', () => {
    seq = 0;
    const events = [
      event('agent.started', '2026-10-25T10:00:00.000Z', 'conditions'),
      event('agent.completed', '2026-10-25T10:00:00.100Z', 'conditions'),
      event('agent.started', '2026-10-25T10:00:00.200Z', 'resources'),
      event('agent.completed', '2026-10-25T10:00:00.300Z', 'resources'),
      event('agent.started', '2026-10-25T10:00:00.400Z', 'access'),
      event('agent.completed', '2026-10-25T10:00:00.500Z', 'access'),
    ];
    const model = buildGantt(agents, events, { runStatus: 'completed' });
    expect(model.branchesOverlap).toBe(false);
  });

  it('returns an explicitly empty interval when no timing exists', () => {
    const model = buildGantt(agents, []);
    expect(model.intervals).toHaveLength(1);
    expect(model.intervals[0].id).toBe('empty');
    expect(model.intervals[0].calls).toBe(0);
  });
});

describe('event presentation', () => {
  it('preserves server event wording', () => {
    const failure = event('run.failed', '2026-10-25T10:00:00.000Z', null, {
      message: 'SQLite unavailable',
    });
    expect(eventSummary(failure)).toBe('SQLite unavailable');
    expect(eventTone('verification.finding')).toBe('warning');
    expect(eventTone('run.completed')).toBe('success');
  });
});
