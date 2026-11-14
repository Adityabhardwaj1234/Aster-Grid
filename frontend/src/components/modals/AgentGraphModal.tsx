import { useMemo, useState } from 'react';
import {
  Activity,
  Check,
  GitFork,
  Info,
  Loader2,
  Lock,
  Network,
  RotateCw,
} from 'lucide-react';

import { buildGantt, deriveAgentStates } from '../../lib/agents';
import { formatDuration, shortHash, titleCase } from '../../lib/format';
import { useAppStore } from '../../store/useAppStore';
import type { AgentDescriptor, AgentId, RunEvent } from '../../types';
import Modal from '../Modal';
import { EmptyState } from '../Controls';
import styles from './AgentGraphModal.module.css';

interface NodeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const NODES: Record<string, NodeBox> = {
  director: { x: 8, y: 148, w: 118, h: 64 },
  intake: { x: 145, y: 148, w: 118, h: 64 },
  world: { x: 282, y: 148, w: 118, h: 64 },
  conditions: { x: 428, y: 34, w: 120, h: 62 },
  resources: { x: 428, y: 149, w: 120, h: 62 },
  access: { x: 428, y: 264, w: 120, h: 62 },
  critic: { x: 638, y: 148, w: 118, h: 64 },
  simulation: { x: 784, y: 148, w: 118, h: 64 },
  reporter: { x: 928, y: 148, w: 118, h: 64 },
};

const JOIN = { cx: 595, cy: 180 };
const GRAPH_WIDTH = 1056;
const GRAPH_HEIGHT = 384;
const PARALLEL = new Set(['conditions', 'resources', 'access']);
const BRANCHES: Array<{ id: AgentId; line: string }> = [
  { id: 'conditions', line: 'Environment' },
  { id: 'resources', line: 'Allocation' },
  { id: 'access', line: 'Reachability' },
];

function shortName(agent: AgentDescriptor): string {
  const names: Record<string, string> = {
    director: 'Director',
    intake: 'Intake',
    world: 'World Builder',
    conditions: 'Conditions',
    resources: 'Resources',
    access: 'Access',
    critic: 'Critic',
    simulation: 'Simulation',
    reporter: 'Reporter',
  };
  return names[agent.id] ?? agent.name;
}

export default function AgentGraphModal() {
  const agents = useAppStore((state) => state.agents);
  const events = useAppStore((state) => state.events);
  const run = useAppStore((state) => state.run);
  const meta = useAppStore((state) => state.meta);
  const setModal = useAppStore((state) => state.setModal);
  const [selectedId, setSelectedId] = useState<AgentId>('director');
  const states = useMemo(
    () => deriveAgentStates(agents, events, run?.status ?? null),
    [agents, events, run?.status],
  );
  const gantt = useMemo(() => buildGantt(agents, events, { runStatus: run?.status }), [agents, events, run?.status]);
  const selected = agents.find((agent) => agent.id === selectedId) ?? agents[0];
  const selectedState = selected ? states[selected.id] : undefined;
  const selectedEvents = events.filter((event) => event.agent_id === selected?.id);
  const complete = Object.values(states).filter((state) => state.status === 'completed').length;
  const active = Object.values(states).find((state) => state.status === 'active');
  const close = () => setModal(null);

  if (!agents.length) {
    return (
      <Modal title="Agent dependency graph" eyebrow="Orchestration" onClose={close} size="xl">
        <EmptyState
          title="Agent descriptors unavailable"
          body="The backend did not return the ADK agent catalog. Reconnect and reload the command center."
          icon={<Network size={16} />}
        />
      </Modal>
    );
  }

  return (
    <Modal
      title="Agent dependency graph"
      eyebrow="Real ADK workflow / typed hand-offs"
      onClose={close}
      size="xl"
      footer={
        <div className={styles.footer}>
          <span>
            <GitFork size={11} /> {PARALLEL.size} parallel branches · join at Critic
          </span>
          <span className={gantt.branchesOverlap ? styles.footerGood : styles.footerMuted}>
            {gantt.branchesOverlap ? <Check size={11} /> : <Activity size={11} />}
            {gantt.branchesOverlap ? 'Observed overlap' : 'Overlap not observed'}
          </span>
          <span>
            <RotateCw size={11} /> Revision loop ≤ {meta?.max_revisions ?? 2}
          </span>
          <span>
            <Lock size={11} /> {run?.effective_mode === 'gemini' ? 'Gemini' : 'Rules'} mode
          </span>
        </div>
      }
    >
      <div className={styles.summaryBar}>
        <div>
          <span className="eyebrow">Execution lattice</span>
          <strong>
            {complete}/{agents.length} agents complete
            {active ? ` · ${active.id} active` : ''}
          </strong>
        </div>
        <div className={styles.legend}>
          <span><i className={styles.dotIdle} /> Idle</span>
          <span><i className={styles.dotActive} /> Active</span>
          <span><i className={styles.dotComplete} /> Complete</span>
          <span><i className={styles.dotAttention} /> Flagged</span>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.graphScroller}>
          <div className={styles.graph} style={{ width: GRAPH_WIDTH, height: GRAPH_HEIGHT }}>
            <svg className={styles.edges} viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} aria-hidden="true">
              <defs>
                <marker id="arrow-ok" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0 0 L8 4 L0 8 z" fill="rgba(94,242,178,0.7)" />
                </marker>
                <marker id="arrow-muted" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0 0 L8 4 L0 8 z" fill="rgba(125,190,209,0.35)" />
                </marker>
                <marker id="arrow-loop" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0 0 L8 4 L0 8 z" fill="rgba(255,179,92,0.8)" />
                </marker>
              </defs>
              <Edge from="director" to="intake" states={states} />
              <Edge from="intake" to="world" states={states} />
              {BRANCHES.map((branch) => (
                <CurvedEdge
                  key={`world-${branch.id}`}
                  start={rightOf('world')}
                  end={leftOf(branch.id)}
                  active={states[branch.id]?.status !== 'idle'}
                  complete={states[branch.id]?.status === 'completed'}
                />
              ))}
              {BRANCHES.map((branch) => (
                <CurvedEdge
                  key={`${branch.id}-join`}
                  start={rightOf(branch.id)}
                  end={{ x: JOIN.cx - 17, y: JOIN.cy }}
                  active={states[branch.id]?.status !== 'idle'}
                  complete={states[branch.id]?.status === 'completed'}
                />
              ))}
              <CurvedEdge
                start={{ x: JOIN.cx + 17, y: JOIN.cy }}
                end={leftOf('critic')}
                active={states.critic?.status !== 'idle'}
                complete={states.critic?.status === 'completed'}
              />
              <Edge from="critic" to="simulation" states={states} />
              <Edge from="simulation" to="reporter" states={states} />
              <path
                d="M 697 212 C 697 290, 490 298, 490 212"
                className={styles.revisionEdge}
                markerEnd="url(#arrow-loop)"
              />
              <text x="594" y="292" className={styles.revisionLabel}>
                BOUNDED REVISION · ≤ {meta?.max_revisions ?? 2}
              </text>
            </svg>

            <div className={styles.join} style={{ left: JOIN.cx, top: JOIN.cy }}>
              <span>JOIN</span>
            </div>

            <div className={styles.branchLabel} style={{ left: 422, top: 4 }}>
              parallel fan-out
            </div>

            {agents.map((agent) => {
              const box = NODES[agent.id];
              if (!box) return null;
              const state = states[agent.id];
              const isSelected = selected?.id === agent.id;
              const status = state?.status ?? 'idle';
              return (
                <button
                  key={agent.id}
                  type="button"
                  className={`${styles.node} ${styles[`node_${status}`] ?? ''} ${
                    isSelected ? styles.nodeSelected : ''
                  }`}
                  style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                  onClick={() => setSelectedId(agent.id)}
                  aria-pressed={isSelected}
                >
                  <span className={styles.nodeTop}>
                    <span className={styles.nodeStatus}>
                      {status === 'active' ? (
                        <Loader2 size={8} className={styles.spin} />
                      ) : status === 'completed' ? (
                        <Check size={8} />
                      ) : (
                        <span />
                      )}
                    </span>
                    <span className={styles.nodeId}>{agent.id}</span>
                  </span>
                  <strong>{shortName(agent)}</strong>
                  <span className={styles.nodeMeta}>
                    {state?.durationMs ? formatDuration(state.durationMs) : titleCase(status)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className={styles.detail} aria-label="Selected agent detail">
          {selected ? (
            <>
              <div className={styles.detailHead}>
                <span className="eyebrow">Selected node</span>
                <h3>{selected.name}</h3>
                <p>{selected.role}</p>
              </div>
              <div className={styles.detailStats}>
                <div>
                  <span>Status</span>
                  <strong className={styles[`detail_${selectedState?.status ?? 'idle'}`] ?? ''}>
                    {titleCase(selectedState?.status ?? 'idle')}
                  </strong>
                </div>
                <div>
                  <span>Duration</span>
                  <strong>{selectedState?.durationMs ? formatDuration(selectedState.durationMs) : '—'}</strong>
                </div>
                <div>
                  <span>Calls</span>
                  <strong>{selectedState?.calls ?? 0}</strong>
                </div>
                <div>
                  <span>Events</span>
                  <strong>{selectedEvents.length}</strong>
                </div>
              </div>
              <div className={styles.detailBlock}>
                <span>Depends on</span>
                <div className={styles.depList}>
                  {selected.depends_on.length ? (
                    selected.depends_on.map((dependency) => (
                      <button
                        key={dependency}
                        type="button"
                        onClick={() => setSelectedId(dependency as AgentId)}
                      >
                        {shortName(agents.find((agent) => agent.id === dependency) ?? selected)}
                      </button>
                    ))
                  ) : (
                    <em>Entry node</em>
                  )}
                </div>
              </div>
              <div className={styles.detailBlock}>
                <span>Latest hand-off</span>
                <code className={styles.hash}>{shortHash(selectedState?.artifactHash, 22)}</code>
                <p>{selectedState?.note || 'No hand-off note recorded yet.'}</p>
              </div>
              <div className={styles.detailBlock}>
                <span>Recent events</span>
                {selectedEvents.length ? (
                  <ol className={styles.agentEvents}>
                    {selectedEvents.slice(-4).reverse().map((event) => (
                      <AgentEventRow key={event.event_id} event={event} />
                    ))}
                  </ol>
                ) : (
                  <p>No events for this role yet.</p>
                )}
              </div>
              <div className={styles.modeNote}>
                <Info size={10} />
                <span>
                  Deterministic policy node. No model prompt or hidden reasoning is exposed.
                </span>
              </div>
            </>
          ) : null}
        </aside>
      </div>
    </Modal>
  );
}

function AgentEventRow({ event }: { event: RunEvent }) {
  return (
    <li>
      <span>{String(event.seq).padStart(3, '0')}</span>
      <div>
        <strong>{titleCase(event.type)}</strong>
        <small>
          {event.payload.name && typeof event.payload.name === 'string'
            ? event.payload.name
            : event.agent_id ?? 'system'}
        </small>
      </div>
    </li>
  );
}

function leftOf(id: string): { x: number; y: number } {
  const box = NODES[id];
  return { x: box.x, y: box.y + box.h / 2 };
}

function rightOf(id: string): { x: number; y: number } {
  const box = NODES[id];
  return { x: box.x + box.w, y: box.y + box.h / 2 };
}

function Edge({
  from,
  to,
  states,
}: {
  from: string;
  to: string;
  states: Record<string, { status: string }>;
}) {
  const start = rightOf(from);
  const end = leftOf(to);
  const complete = states[from]?.status === 'completed' && states[to]?.status !== 'idle';
  const active = states[to]?.status === 'active';
  const middle = (start.x + end.x) / 2;
  return (
    <path
      d={`M ${start.x} ${start.y} L ${middle} ${start.y} L ${middle} ${end.y} L ${end.x} ${end.y}`}
      className={`${styles.edge} ${complete ? styles.edgeComplete : active ? styles.edgeActive : ''}`}
      markerEnd={complete ? 'url(#arrow-ok)' : 'url(#arrow-muted)'}
    />
  );
}

function CurvedEdge({
  start,
  end,
  active,
  complete,
}: {
  start: { x: number; y: number };
  end: { x: number; y: number };
  active: boolean;
  complete: boolean;
}) {
  const mid = (start.x + end.x) / 2;
  return (
    <path
      d={`M ${start.x} ${start.y} C ${mid} ${start.y}, ${mid} ${end.y}, ${end.x} ${end.y}`}
      className={`${styles.edge} ${complete ? styles.edgeComplete : active ? styles.edgeActive : ''}`}
      markerEnd={complete ? 'url(#arrow-ok)' : 'url(#arrow-muted)'}
    />
  );
}
