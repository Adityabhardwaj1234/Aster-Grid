import { useMemo } from 'react';
import { BarChart3, Clock3, GitFork, Info, Radio } from 'lucide-react';

import { buildGantt, deriveAgentStates } from '../../lib/agents';
import { formatTimestamp, titleCase } from '../../lib/format';
import { useAppStore } from '../../store/useAppStore';
import Modal from '../Modal';
import { EmptyState, StatusPill } from '../Controls';
import styles from './GanttModal.module.css';

const AXIS = [0, 0.25, 0.5, 0.75, 1];

export default function GanttModal() {
  const agents = useAppStore((state) => state.agents);
  const events = useAppStore((state) => state.events);
  const run = useAppStore((state) => state.run);
  const setModal = useAppStore((state) => state.setModal);
  const gantt = useMemo(() => buildGantt(agents, events, { runStatus: run?.status }), [agents, events, run?.status]);
  const states = useMemo(() => deriveAgentStates(agents, events, run?.status ?? null), [agents, events, run?.status]);
  const close = () => setModal(null);
  const span = Math.max(1, gantt.endMs - gantt.startMs);
  const branchIntervals = gantt.intervals.filter((interval) =>
    ['conditions', 'resources', 'access'].includes(interval.agentId),
  );
  const overlapStart = branchIntervals.length
    ? Math.max(...branchIntervals.map((interval) => interval.startMs))
    : 0;
  const overlapEnd = branchIntervals.length
    ? Math.min(...branchIntervals.map((interval) => interval.endMs))
    : 0;
  const overlapWidth =
    overlapEnd > overlapStart ? ((overlapEnd - overlapStart) / span) * 100 : 0;
  const overlapLeft = ((overlapStart - gantt.startMs) / span) * 100;
  const total = gantt.endMs - gantt.startMs;
  const hasTiming = events.some(
    (event) => event.type === 'run.started' || event.type === 'agent.started',
  );
  const endTs = gantt.intervals.reduce(
    (latest, interval) => (interval.endMs >= latest.endMs ? interval : latest),
    gantt.intervals[0],
  )?.endTs;
  const terminal = run
    ? ['completed', 'needs_attention', 'failed', 'cancelled', 'interrupted'].includes(run.status)
    : false;

  return (
    <Modal
      title="Execution ledger"
      eyebrow="Wall-clock agent timeline / real events only"
      onClose={close}
      size="xl"
      footer={
        <div className={styles.footer}>
          <span>
            <Radio size={10} /> {events.length} server events
          </span>
          <span>
            <Clock3 size={10} /> Observed span {formatDuration(total)}
          </span>
          <span className={gantt.branchesOverlap ? styles.overlapGood : styles.overlapMuted}>
            <GitFork size={10} />
            {gantt.branchesOverlap
              ? `Parallel overlap ${formatDuration(overlapEnd - overlapStart)}`
              : 'No three-way overlap captured'}
          </span>
          <span>
            <Info size={10} /> Bars are derived from timestamped agent events, never fabricated.
          </span>
        </div>
      }
    >
      <div className={styles.summaryBar}>
        <div>
          <span className="eyebrow">Run telemetry</span>
          <strong>{terminal ? 'Settled execution interval' : 'Live execution interval'}</strong>
          <p>
            {formatTimestamp(gantt.intervals[0]?.startTs)} → {formatTimestamp(endTs)}
          </p>
        </div>
        <div className={styles.summaryStats}>
          <span>
            AGENTS <strong>{agents.length}</strong>
          </span>
          <span>
            INTERVALS <strong>{gantt.intervals.length}</strong>
          </span>
          <span>
            CALLS <strong>{gantt.intervals.reduce((sum, interval) => sum + interval.calls, 0)}</strong>
          </span>
          <span>
            REVISIONS <strong>{run?.revision_count ?? 0}</strong>
          </span>
        </div>
      </div>

      {!hasTiming ? (
        <div className={styles.emptyWrap}>
          <EmptyState
            title="No timing evidence yet"
            body="The Gantt chart populates from timestamped agent lifecycle events as soon as the workflow starts. No placeholder bars are drawn."
            icon={<BarChart3 size={16} />}
          />
        </div>
      ) : (
        <div className={styles.chart}>
          <div className={styles.chartHead}>
            <div className={styles.chartHeadLabel}>
              <BarChart3 size={11} />
              Agent lane
            </div>
            <div className={styles.axis}>
              {AXIS.map((fraction) => (
                <span key={fraction} style={{ left: `${fraction * 100}%` }}>
                  {formatAxis(gantt.startMs + span * fraction)}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.lanes}>
            {overlapWidth > 0 ? (
              <div className={styles.overlapZone} aria-hidden="true">
                <div
                  className={styles.overlapBand}
                  style={{ left: `${overlapLeft}%`, width: `${overlapWidth}%` }}
                  title={`Observed branch overlap: ${formatDuration(overlapEnd - overlapStart)}`}
                >
                  <span>PARALLEL</span>
                </div>
              </div>
            ) : null}
            {gantt.rows.map((row) => {
              const agent = agents.find((candidate) => candidate.id === row.agentId);
              if (!agent) return null;
              const state = states[row.agentId];
              return (
                <div key={row.agentId} className={styles.row}>
                  <div className={styles.rowLabel}>
                    <span className={`${styles.rowDot} ${styles[`rowDot_${state?.status ?? 'idle'}`] ?? ''}`} />
                    <div>
                      <strong>{agent.name}</strong>
                      <span>
                        {titleCase(state?.status ?? 'idle')} · {state?.calls ?? row.intervals.length} call
                        {(state?.calls ?? row.intervals.length) === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                  <div className={styles.lane}>
                    {row.intervals.map((interval) => {
                      const left = ((interval.startMs - gantt.startMs) / span) * 100;
                      const width = Math.max(0.8, ((interval.endMs - interval.startMs) / span) * 100);
                      const isActive = state?.status === 'active' && interval === row.intervals[row.intervals.length - 1];
                      return (
                        <div
                          key={interval.id}
                          className={`${styles.bar} ${isActive ? styles.barActive : ''} ${
                            state?.status === 'needs_attention' ? styles.barAttention : ''
                          }`}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          title={`${agent.name} · ${formatTimestamp(interval.startTs)} → ${formatTimestamp(interval.endTs)} · ${formatDuration(interval.endMs - interval.startMs)}`}
                        >
                          <span>{formatDuration(interval.endMs - interval.startMs)}</span>
                        </div>
                      );
                    })}
                    {!row.intervals.length ? <span className={styles.noInterval}>not scheduled</span> : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.observations}>
            <div className={styles.observationHead}>
              <span>Observed sequence</span>
              <span>{gantt.branchesOverlap ? 'Parallel branches verified' : 'Awaiting concurrent branch evidence'}</span>
            </div>
            <div className={styles.sequence}>
              {agents.map((agent) => {
                const state = states[agent.id];
                return (
                  <div key={agent.id} className={styles.sequenceItem}>
                    <StatusPill status={state?.status ?? 'idle'} label={agent.id} />
                    <span>{state?.durationMs ? formatDuration(state.durationMs) : '—'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function formatAxis(ms: number): string {
  const date = new Date(ms);
  return `${date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}
