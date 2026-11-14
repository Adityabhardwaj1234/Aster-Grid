import { ArrowUpRight, Check, GitBranch, Loader2, Minus } from 'lucide-react';

import { buildGantt, deriveAgentStates } from '../../lib/agents';
import { formatDuration, shortHash, titleCase } from '../../lib/format';
import { useAppStore } from '../../store/useAppStore';
import { PanelTitle } from '../Controls';
import styles from './AgentRail.module.css';

const BRANCHES = new Set(['conditions', 'resources', 'access']);

export default function AgentRail() {
  const agents = useAppStore((state) => state.agents);
  const events = useAppStore((state) => state.events);
  const run = useAppStore((state) => state.run);
  const selection = useAppStore((state) => state.selection);
  const selectEntity = useAppStore((state) => state.selectEntity);
  const setModal = useAppStore((state) => state.setModal);
  const states = deriveAgentStates(agents, events, run?.status ?? null);
  const gantt = buildGantt(agents, events, { runStatus: run?.status });
  const completed = Object.values(states).filter((state) => state.status === 'completed').length;
  const active = Object.values(states).find((state) => state.status === 'active');

  return (
    <section className={`${styles.panel} ag-panel`} aria-labelledby="agents-title">
      <PanelTitle
        eyebrow="Orchestration / 02"
        title="Agent lattice"
        id="agents-title"
        right={
          <button
            type="button"
            className={styles.inspect}
            onClick={() => setModal('agents')}
            title="Open full dependency graph"
          >
            <GitBranch size={11} />
            Graph
          </button>
        }
      />
      <div className={styles.summary}>
        <span>
          <strong>{completed}</strong>/{agents.length} complete
        </span>
        <span className={active ? styles.activeLabel : styles.idleLabel}>
          {active ? `${titleCase(active.id)} active` : run ? titleCase(run.status) : 'Standby'}
        </span>
      </div>

      <ol className={styles.list} aria-label="Specialist agent status">
        {agents.map((agent, index) => {
          const state = states[agent.id];
          const isActive = state?.status === 'active';
          const isComplete = state?.status === 'completed';
          const isFailed = state?.status === 'failed' || state?.status === 'needs_attention';
          const selected = selection?.kind === 'agent' && selection.id === agent.id;
          return (
            <li key={agent.id}>
              <button
                type="button"
                className={`${styles.row} ${isActive ? styles.rowActive : ''} ${
                  selected ? styles.rowSelected : ''
                }`}
                onClick={() =>
                  selectEntity({
                    kind: 'agent',
                    id: agent.id,
                    label: agent.name,
                    detail: `${agent.role} · ${state?.status ?? 'idle'}`,
                  })
                }
                aria-current={isActive ? 'step' : undefined}
              >
                <span className={styles.rail} aria-hidden="true">
                  <span
                    className={`${styles.node} ${isActive ? styles.nodeActive : ''} ${
                      isComplete ? styles.nodeComplete : ''
                    } ${isFailed ? styles.nodeFailed : ''}`}
                  >
                    {isActive ? (
                      <Loader2 size={8} className={styles.spin} />
                    ) : isComplete ? (
                      <Check size={8} />
                    ) : isFailed ? (
                      <Minus size={8} />
                    ) : (
                      <span />
                    )}
                  </span>
                  {index < agents.length - 1 ? <span className={styles.line} /> : null}
                </span>
                <span className={styles.copy}>
                  <span className={styles.nameRow}>
                    <strong>{agent.name}</strong>
                    {BRANCHES.has(agent.id) ? (
                      <span className={styles.branch} title="Parallel ADK branch">
                        ∥
                      </span>
                    ) : null}
                    {isActive ? <span className={styles.live}>Live</span> : null}
                  </span>
                  <span className={styles.role}>{agent.role}</span>
                  <span className={styles.meta}>
                    <span className={styles.state}>{state?.status.replace('_', ' ') ?? 'idle'}</span>
                    {state?.durationMs ? <span>{formatDuration(state.durationMs)}</span> : null}
                    {state?.artifactHash ? <span>{shortHash(state.artifactHash, 6)}</span> : null}
                  </span>
                </span>
                <ArrowUpRight size={10} className={styles.chevron} />
              </button>
            </li>
          );
        })}
      </ol>

      <footer className={styles.footer}>
        <span className={gantt.branchesOverlap ? styles.overlap : styles.overlapIdle}>
          <span aria-hidden="true" />
          {gantt.branchesOverlap ? 'Fan-out overlap verified' : 'Awaiting branch overlap'}
        </span>
        <span>{events.length} events</span>
      </footer>
    </section>
  );
}
