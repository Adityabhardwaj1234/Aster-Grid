import { describe, expect, it } from 'vitest';

import {
  affectedAssignmentIds,
  firstProposalFromEvents,
  selectFindings,
  selectInitialProposal,
} from './useAppStore';
import type { Finding, RunEvent } from '../types';

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: 'F-1',
    severity: 'error',
    code: 'ROUTE_BLOCKED',
    message: 'blocked',
    entity_ids: ['ASG-1'],
    evidence: {},
    repair_hint: '',
    ...overrides,
  };
}

describe('derived store selectors', () => {
  it('extracts the initial proposal from an artifact event', () => {
    const event = {
      event_id: 'evt-1',
      run_id: 'run-1',
      seq: 1,
      type: 'artifact.created',
      ts: '2026-10-25T10:00:00.000Z',
      agent_id: 'resources',
      status: null,
      payload: {
        kind: 'proposal',
        summary: {
          id: 'PRP-1',
          revision: 0,
          hash: 'hash-1',
          assignments: [{ id: 'ASG-1' }],
          unassigned: [],
        },
      },
    } as RunEvent;
    const proposal = firstProposalFromEvents([event]);
    expect(proposal?.id).toBe('PRP-1');
    expect(proposal?.assignments[0].id).toBe('ASG-1');
    expect(firstProposalFromEvents([])).toBeNull();
  });

  it('returns a cached proposal for the same event array', () => {
    const state = {
      events: [
        {
          event_id: 'evt-1',
          run_id: 'run-1',
          seq: 1,
          type: 'artifact.created',
          ts: '2026-10-25T10:00:00.000Z',
          agent_id: 'resources',
          status: null,
          payload: { kind: 'proposal', summary: { id: 'PRP-1', assignments: [] } },
        },
      ],
    } as never;
    expect(selectInitialProposal(state)).toBe(selectInitialProposal(state));
  });

  it('extracts assignment ids only from blocking route findings', () => {
    const source = [
      finding({ entity_ids: ['ASG-1', 'A-2'] }),
      finding({ id: 'F-2', code: 'TIME_WINDOW_OVERLAP', entity_ids: ['ASG-2', 'ASG-3'] }),
      finding({ id: 'F-3', severity: 'warning', entity_ids: ['ASG-4'] }),
      finding({ id: 'F-4', code: 'CAPACITY', entity_ids: ['ASG-5'] }),
    ];
    expect([...affectedAssignmentIds(source)]).toEqual(['ASG-1', 'ASG-2', 'ASG-3']);
    expect(affectedAssignmentIds(source)).toBe(affectedAssignmentIds(source));
    expect(affectedAssignmentIds([])).toEqual(new Set());
  });

  it('prefers report findings and stabilises combined findings', () => {
    const preflight = { findings: [finding({ id: 'PF-1' })] };
    const outcome = { findings: [finding({ id: 'OUT-1' })] };
    const state = {
      artifacts: { preflight, outcome },
      bundle: null,
    } as never;
    const combined = selectFindings(state);
    expect(combined.map((item) => item.id)).toEqual(['PF-1', 'OUT-1']);
    expect(selectFindings(state)).toBe(combined);

    const report = { findings: [finding({ id: 'RPT-1' })] };
    const reportState = {
      artifacts: { report, preflight, outcome },
      bundle: null,
    } as never;
    expect(selectFindings(reportState)).toBe(report.findings);
  });
});
