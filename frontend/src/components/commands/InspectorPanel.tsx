import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Crosshair,
  FileJson,
  Info,
  ListFilter,
  LocateFixed,
  Radio,
  ShieldAlert,
  Waypoints,
  X,
} from 'lucide-react';

import { deriveAgentStates, eventSummary, eventTone } from '../../lib/agents';
import {
  formatMinutes,
  formatTimestamp,
  safeJson,
  shortHash,
  titleCase,
} from '../../lib/format';
import { useAppStore } from '../../store/useAppStore';
import type {
  AllocationProposal,
  ConditionsReport,
  FinalReport,
  Finding,
  RunEvent,
  RunRecord,
  SimulationResult,
  Snapshot,
  World,
} from '../../types';
import { CopyButton, EmptyState, PanelTitle, StatusPill } from '../Controls';
import styles from './InspectorPanel.module.css';

interface StagedFinding {
  finding: Finding;
  stage: 'preflight' | 'outcome' | 'history';
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.field}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CodeBlock({ value }: { value: unknown }) {
  return <pre className={styles.codeBlock}>{safeJson(value)}</pre>;
}

export default function InspectorPanel() {
  const tab = useAppStore((state) => state.inspectorTab);
  const setTab = useAppStore((state) => state.setInspectorTab);
  const events = useAppStore((state) => state.events);
  const run = useAppStore((state) => state.run);
  const selection = useAppStore((state) => state.selection);
  const preflight = useAppStore((state) => state.artifacts.preflight ?? null);
  const outcome = useAppStore((state) => state.artifacts.outcome ?? null);
  const report = useAppStore((state) => state.artifacts.report ?? state.bundle?.report ?? null);
  const world = useAppStore((state) => state.artifacts.world ?? state.preview?.world ?? null);
  const proposal = useAppStore((state) => state.artifacts.proposal ?? null);
  const simulation = useAppStore((state) => state.artifacts.simulation ?? null);
  const conditions = useAppStore((state) => state.artifacts.conditions ?? null);
  const agents = useAppStore((state) => state.agents);
  const selectedTick = useAppStore((state) => state.selectedTick);
  const selectEntity = useAppStore((state) => state.selectEntity);
  const focusSelection = useAppStore((state) => state.focusSelection);
  const [openFinding, setOpenFinding] = useState<string | null>(null);

  const stagedFindings = useMemo<StagedFinding[]>(() => {
    if (report?.findings?.length) {
      return report.findings.map((finding) => ({ finding, stage: 'history' }));
    }
    const result: StagedFinding[] = [];
    for (const finding of preflight?.findings ?? []) {
      result.push({ finding, stage: 'preflight' });
    }
    for (const finding of outcome?.findings ?? []) {
      result.push({ finding, stage: 'outcome' });
    }
    return result;
  }, [outcome, preflight, report]);

  const errors = stagedFindings.filter((entry) => entry.finding.severity === 'error').length;
  const warnings = stagedFindings.filter((entry) => entry.finding.severity === 'warning').length;
  const orderedEvents = useMemo(
    () => [...events].sort((a, b) => b.seq - a.seq),
    [events],
  );
  const snapshot =
    simulation?.snapshots.find((candidate) => candidate.tick === selectedTick) ??
    simulation?.snapshots[simulation.snapshots.length - 1];

  return (
    <section className={`${styles.panel} ag-panel`} aria-labelledby="inspector-title">
      <PanelTitle
        eyebrow="Provenance / 04"
        title="Evidence inspector"
        id="inspector-title"
        right={
          <span className={styles.eventCount}>
            <Radio size={9} />
            {events.length}
          </span>
        }
      />
      <div className={styles.tabs} role="tablist" aria-label="Evidence inspector views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'findings'}
          className={tab === 'findings' ? styles.tabActive : ''}
          onClick={() => setTab('findings')}
        >
          <ShieldAlert size={10} />
          Findings
          <span className={errors ? styles.badgeError : styles.badge}>{errors || stagedFindings.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'events'}
          className={tab === 'events' ? styles.tabActive : ''}
          onClick={() => setTab('events')}
        >
          <Radio size={10} />
          Events
          <span className={styles.badge}>{events.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'detail'}
          className={tab === 'detail' ? styles.tabActive : ''}
          onClick={() => setTab('detail')}
        >
          <LocateFixed size={10} />
          Inspect
          {selection ? <span className={styles.badgeLive} /> : null}
        </button>
      </div>

      <div className={styles.content}>
        {tab === 'findings' ? (
          <div className={styles.findingsPane} role="tabpanel">
            <div className={styles.verifySummary}>
              <div>
                <span>Preflight</span>
                {preflight ? (
                  <StatusPill status={preflight.passed ? 'ok' : 'needs_attention'} label={preflight.passed ? 'Pass' : 'Blocked'} />
                ) : (
                  <span className={styles.muted}>Pending</span>
                )}
              </div>
              <div>
                <span>Outcome</span>
                {outcome ? (
                  <StatusPill status={outcome.passed ? 'ok' : 'needs_attention'} label={outcome.passed ? 'Pass' : 'Flagged'} />
                ) : (
                  <span className={styles.muted}>Pending</span>
                )}
              </div>
              <div>
                <span>Findings</span>
                <strong className={errors ? styles.errorText : ''}>
                  {errors} err · {warnings} warn
                </strong>
              </div>
            </div>

            {stagedFindings.length ? (
              <ul className={styles.findingList}>
                {stagedFindings.map(({ finding, stage }) => {
                  const open = openFinding === finding.id;
                  return (
                    <li key={`${stage}-${finding.id}`} className={`${styles.finding} ${styles[finding.severity]}`}>
                      <button
                        type="button"
                        className={styles.findingHead}
                        onClick={() => setOpenFinding(open ? null : finding.id)}
                        aria-expanded={open}
                      >
                        <span className={styles.severityIcon}>
                          {finding.severity === 'error' ? (
                            <AlertTriangle size={11} />
                          ) : finding.severity === 'warning' ? (
                            <Info size={11} />
                          ) : (
                            <CheckCircle2 size={11} />
                          )}
                        </span>
                        <span className={styles.findingTitle}>
                          <strong>{finding.code.replace(/_/g, ' ')}</strong>
                          <span>
                            {stage === 'history' ? 'revision history' : stage} ·{' '}
                            {finding.entity_ids.slice(0, 2).join(' · ') || 'global'}
                          </span>
                        </span>
                        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      </button>
                      {open ? (
                        <div className={styles.findingBody}>
                          <p>{finding.message}</p>
                          {finding.repair_hint ? (
                            <p className={styles.hint}>
                              <Crosshair size={9} />
                              {finding.repair_hint}
                            </p>
                          ) : null}
                          <div className={styles.entityList}>
                            {finding.entity_ids.map((id) => (
                              <span key={id}>{id}</span>
                            ))}
                          </div>
                          <CodeBlock value={finding.evidence} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                title="No findings yet"
                body="Preflight and outcome findings will appear here as typed evidence, including repaired findings from every revision."
                icon={<ListFilter size={14} />}
              />
            )}

            {report?.revisions.length ? (
              <div className={styles.revisionBlock}>
                <div className={styles.subhead}>
                  Revision ledger <span>{report.revisions.length}</span>
                </div>
                {report.revisions.map((revision) => (
                  <div key={revision.attempt} className={styles.revisionRow}>
                    <span className={styles.revisionIndex}>R{revision.attempt}</span>
                    <div>
                      <strong>{revision.trigger_codes.join(' · ')}</strong>
                      <p>{revision.changes.join(' ')}</p>
                    </div>
                    <span className={styles.revisionCount}>−{revision.assignments_changed}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'events' ? (
          <div className={styles.eventsPane} role="tabpanel">
            {orderedEvents.length ? (
              <ol className={styles.eventList}>
                {orderedEvents.slice(0, 160).map((event) => (
                  <EventRow key={event.event_id} event={event} onOpen={() => {
                    selectEntity({
                      kind: 'event',
                      id: event.event_id,
                      label: event.type,
                      detail: eventSummary(event),
                    });
                  }} />
                ))}
              </ol>
            ) : (
              <EmptyState
                title="Ledger is empty"
                body="The SSE stream will fill this ledger with real server events as the ADK workflow advances."
                icon={<Radio size={14} />}
              />
            )}
          </div>
        ) : null}

        {tab === 'detail' ? (
          <div className={styles.detailPane} role="tabpanel">
            {selection ? (
              <>
                <div className={styles.selectionHead}>
                  <div>
                    <span>{selection.kind}</span>
                    <h3>{selection.label}</h3>
                    <p>{selection.detail}</p>
                  </div>
                  <div className={styles.selectionActions}>
                    {selection.position ? (
                      <button type="button" onClick={focusSelection} title="Focus in 3D scene">
                        <Crosshair size={11} />
                      </button>
                    ) : null}
                    <button type="button" onClick={() => selectEntity(null)} title="Clear selection">
                      <X size={11} />
                    </button>
                  </div>
                </div>
                <SelectionDetail
                  kind={selection.kind}
                  id={selection.id}
                  world={world}
                  proposal={proposal}
                  report={report}
                  simulation={simulation}
                  conditions={conditions}
                  snapshot={snapshot}
                  events={events}
                  run={run}
                  agents={agents}
                />
              </>
            ) : (
              <EmptyState
                title="Nothing selected"
                body="Select an asset, route, district, facility, or finding in the scene to inspect its typed evidence and provenance."
                icon={<LocateFixed size={14} />}
              />
            )}
          </div>
        ) : null}
      </div>

      <div className={styles.provenance}>
        <div className={styles.provenanceHead}>
          <span>
            <Waypoints size={9} /> Hash chain
          </span>
          <span>{report ? 'Verified bundle' : run ? 'Awaiting commit' : 'Standby'}</span>
        </div>
        <div className={styles.hashRow}>
          <span>W</span>
          <code>{shortHash(report?.world_hash ?? run?.world_hash ?? world?.hash, 14)}</code>
          <CopyButton value={report?.world_hash ?? run?.world_hash ?? world?.hash ?? ''} label="copy" />
        </div>
        <div className={styles.hashRow}>
          <span>S</span>
          <code>{shortHash(report?.simulation_hash ?? run?.manifest?.simulation_hash, 14)}</code>
          <CopyButton value={report?.simulation_hash ?? run?.manifest?.simulation_hash ?? ''} label="copy" />
        </div>
        <div className={styles.hashRow}>
          <span>R</span>
          <code>{shortHash(report?.result_hash ?? run?.result_hash, 14)}</code>
          <CopyButton value={report?.result_hash ?? run?.result_hash ?? ''} label="copy" />
        </div>
      </div>
    </section>
  );
}

function EventRow({ event, onOpen }: { event: RunEvent; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`${styles.event} ${styles[`tone_${eventTone(event.type)}`] ?? ''}`}>
      <button
        type="button"
        className={styles.eventHead}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.seq}>#{String(event.seq).padStart(3, '0')}</span>
        <span className={styles.eventMain}>
          <strong>{titleCase(event.type)}</strong>
          <span>{eventSummary(event)}</span>
        </span>
        <span className={styles.eventTime}>{formatTimestamp(event.ts)}</span>
      </button>
      {open ? (
        <div className={styles.eventBody}>
          <div className={styles.eventMeta}>
            <span>{event.agent_id ?? 'system'}</span>
            <span>{event.event_id}</span>
            <button
              type="button"
              onClick={() => {
                onOpen();
                setOpen(false);
              }}
            >
              <FileJson size={10} /> Inspect
            </button>
          </div>
          <CodeBlock value={event.payload} />
        </div>
      ) : null}
    </li>
  );
}

interface SelectionDetailProps {
  kind: string;
  id: string;
  world: World | null;
  proposal: AllocationProposal | null;
  report: FinalReport | null;
  simulation: SimulationResult | null;
  conditions: ConditionsReport | null;
  snapshot: Snapshot | undefined;
  events: RunEvent[];
  run: RunRecord | null;
  agents: import('../../types').AgentDescriptor[];
}

function SelectionDetail({
  kind,
  id,
  world,
  proposal,
  report,
  simulation,
  conditions,
  snapshot,
  events,
  run,
  agents,
}: SelectionDetailProps) {
  if (kind === 'asset' && world) {
    const asset = world.assets.find((candidate) => candidate.id === id);
    const state = snapshot?.assets.find((candidate) => candidate.id === id);
    const assignment =
      proposal?.assignments.find((candidate) => candidate.asset_id === id) ??
      report?.assignments.find((candidate) => candidate.asset_id === id);
    if (asset) {
      return (
        <div className={styles.detail}>
          <div className={styles.infoGrid}>
            <Field label="Asset" value={`${asset.callsign} / ${asset.id}`} />
            <Field label="Type" value={titleCase(asset.type)} />
            <Field label="Capability" value={titleCase(asset.capability)} />
            <Field label="Capacity" value={asset.capacity} />
            <Field label="Speed" value={`${asset.speed_kph} kph`} />
            <Field label="Availability" value={`${asset.available_from_min}–${asset.available_until_min} min`} />
            <Field label="Runtime status" value={state ? titleCase(state.status) : 'Not simulated'} />
            <Field label="Progress" value={state ? `${Math.round(state.progress * 100)}%` : '—'} />
          </div>
          {assignment ? (
            <div className={styles.subblock}>
              <div className={styles.subhead}>Active assignment</div>
              <div className={styles.infoGrid}>
                <Field label="Assignment" value={assignment.id} />
                <Field label="Demand" value={assignment.demand_id} />
                <Field label="Window" value={`${assignment.start_min}–${assignment.end_min} min`} />
                <Field label="Status" value={titleCase(assignment.status)} />
              </div>
              <p className={styles.rationale}>{assignment.rationale}</p>
            </div>
          ) : null}
          <CodeBlock value={asset} />
        </div>
      );
    }
  }

  if (kind === 'demand' && world) {
    const demand = world.demands.find((candidate) => candidate.id === id);
    const assignment =
      proposal?.assignments.find((candidate) => candidate.demand_id === id) ??
      report?.assignments.find((candidate) => candidate.demand_id === id);
    const completed = simulation?.events.some(
      (event) =>
        event.kind === 'task_completed' &&
        event.entity_ids.includes(id) &&
        event.t_min <= (snapshot?.sim_time_min ?? 0),
    );
    if (demand) {
      return (
        <div className={styles.detail}>
          <div className={styles.infoGrid}>
            <Field label="Demand" value={demand.label} />
            <Field label="Kind" value={titleCase(demand.kind)} />
            <Field label="District" value={demand.district_id} />
            <Field label="Quantity" value={`${demand.quantity} ${demand.unit}`} />
            <Field label="Priority" value={demand.priority} />
            <Field label="Window" value={`${demand.window_start_min}–${demand.window_end_min} min`} />
            <Field label="Capability" value={titleCase(demand.required_capability)} />
            <Field label="At selected tick" value={completed ? 'Complete' : 'Open'} />
          </div>
          <div className={styles.infoGrid}>
            <Field label="Node" value={demand.node_id} />
            <Field label="Facility" value={demand.destination_facility_id ?? '—'} />
            <Field label="Target edge" value={demand.target_edge_id ?? '—'} />
            <Field label="Assignment" value={assignment?.id ?? 'Unassigned'} />
          </div>
          {assignment ? <p className={styles.rationale}>{assignment.rationale}</p> : null}
          <CodeBlock value={demand} />
        </div>
      );
    }
  }

  if ((kind === 'bridge' || kind === 'edge') && world) {
    const edge = world.edges.find((candidate) => candidate.id === id);
    const road = snapshot?.roads.find((candidate) => candidate.edge_id === id);
    if (edge) {
      return (
        <div className={styles.detail}>
          <div className={styles.infoGrid}>
            <Field label="Segment" value={edge.label || edge.id} />
            <Field label="Type" value={edge.bridge ? 'Bridge crossing' : 'Road edge'} />
            <Field label="Length" value={`${edge.length_m} m`} />
            <Field label="Speed" value={`${edge.speed_kph} kph`} />
            <Field label="Capacity" value={edge.capacity} />
            <Field label="Clearance" value={edge.clearance_m === null ? '—' : `${edge.clearance_m} m`} />
            <Field label="Low point" value={`${edge.low_point_m} m`} />
            <Field
              label="Road state"
              value={road ? titleCase(road.status) : conditions?.closed_edge_ids.includes(id) ? 'Closed' : 'Open'}
            />
          </div>
          {road ? <p className={styles.rationale}>{road.reason}</p> : null}
          <CodeBlock value={edge} />
        </div>
      );
    }
  }

  if (kind === 'district' && world) {
    const district = world.districts.find((candidate) => candidate.id === id);
    if (district) {
      const demands = world.demands.filter((demand) => demand.district_id === id);
      const facilities = world.facilities.filter((facility) => facility.district_id === id);
      return (
        <div className={styles.detail}>
          <div className={styles.infoGrid}>
            <Field label="District" value={district.name} />
            <Field label="Population" value={district.population.toLocaleString('en-US')} />
            <Field label="Base risk" value={`${Math.round(district.risk_base * 100)}%`} />
            <Field label="Elevation" value={`${district.elevation_m} m`} />
            <Field label="Demands" value={demands.length} />
            <Field label="Facilities" value={facilities.length} />
          </div>
          <div className={styles.entityList}>
            {demands.map((demand) => (
              <span key={demand.id}>{demand.label}</span>
            ))}
          </div>
          <CodeBlock value={district} />
        </div>
      );
    }
  }

  if (kind === 'facility' && world) {
    const facility = world.facilities.find((candidate) => candidate.id === id);
    if (facility) {
      const node = world.nodes.find((candidate) => candidate.id === facility.node_id);
      return (
        <div className={styles.detail}>
          <div className={styles.infoGrid}>
            <Field label="Facility" value={facility.name} />
            <Field label="Type" value={titleCase(facility.type)} />
            <Field label="District" value={facility.district_id} />
            <Field label="Capacity" value={facility.capacity} />
            <Field label="Stock" value={facility.stock} />
            <Field label="Status" value={titleCase(facility.status)} />
            <Field label="Node" value={facility.node_id} />
            <Field label="Coordinates" value={node ? `${node.x.toFixed(0)}, ${node.z.toFixed(0)}` : '—'} />
          </div>
          <CodeBlock value={facility} />
        </div>
      );
    }
  }

  if (kind === 'route') {
    const assignment =
      proposal?.assignments.find((candidate) => candidate.id === id) ??
      report?.assignments.find((candidate) => candidate.id === id);
    const route = simulation?.routes.find((candidate) => candidate.assignment_id === id);
    if (assignment) {
      const findingsForRoute = report?.findings.filter((finding) =>
        finding.entity_ids.includes(assignment.id),
      );
      return (
        <div className={styles.detail}>
          <div className={styles.infoGrid}>
            <Field label="Assignment" value={assignment.id} />
            <Field label="Asset" value={assignment.asset_id} />
            <Field label="Demand" value={assignment.demand_id} />
            <Field label="State" value={titleCase(route?.state ?? assignment.status)} />
            <Field label="Window" value={`${assignment.start_min}–${assignment.end_min} min`} />
            <Field label="Travel" value={formatMinutes(assignment.travel_min)} />
            <Field label="Service" value={formatMinutes(assignment.service_min)} />
            <Field label="Route source" value={titleCase(assignment.route_source)} />
          </div>
          <div className={styles.entityList}>
            {assignment.route_edge_ids.map((edgeId) => (
              <span key={edgeId}>{edgeId}</span>
            ))}
          </div>
          <p className={styles.rationale}>{assignment.rationale}</p>
          {findingsForRoute?.length ? (
            <div className={styles.subblock}>
              <div className={styles.subhead}>Linked findings</div>
              {findingsForRoute.map((finding) => (
                <div key={finding.id} className={styles.linkedFinding}>
                  <span>{finding.severity}</span>
                  {finding.code}
                </div>
              ))}
            </div>
          ) : null}
          <CodeBlock value={{ assignment, route }} />
        </div>
      );
    }
  }

  if (kind === 'agent') {
    const descriptor = agents.find((agent) => agent.id === id);
    const state = deriveAgentStates(agents, events, run?.status ?? null)[id];
    const agentEvents = events.filter((event) => event.agent_id === id);
    return (
      <div className={styles.detail}>
        <div className={styles.infoGrid}>
          <Field label="Agent" value={descriptor?.name ?? id} />
          <Field label="Role" value={descriptor?.role ?? '—'} />
          <Field label="Mode" value={titleCase(descriptor?.mode ?? run?.effective_mode ?? 'deterministic')} />
          <Field label="Status" value={titleCase(state?.status ?? 'idle')} />
          <Field label="Duration" value={state?.durationMs ? formatMinutes(state.durationMs / 60000) : '—'} />
          <Field label="Calls" value={state?.calls ?? 0} />
          <Field label="Events" value={agentEvents.length} />
          <Field label="Artifact" value={shortHash(state?.artifactHash, 14)} />
        </div>
        {state?.note ? <p className={styles.rationale}>{state.note}</p> : null}
        <CodeBlock value={descriptor ?? { id }} />
      </div>
    );
  }

  if (kind === 'event') {
    const event = events.find((candidate) => candidate.event_id === id);
    if (event) {
      return (
        <div className={styles.detail}>
          <div className={styles.infoGrid}>
            <Field label="Type" value={titleCase(event.type)} />
            <Field label="Sequence" value={event.seq} />
            <Field label="Agent" value={event.agent_id ?? 'system'} />
            <Field label="Timestamp" value={formatTimestamp(event.ts)} />
          </div>
          <p className={styles.rationale}>{eventSummary(event)}</p>
          <CodeBlock value={event.payload} />
        </div>
      );
    }
  }

  if (kind === 'finding') {
    const finding = report?.findings.find((candidate) => candidate.id === id);
    if (finding) {
      return (
        <div className={styles.detail}>
          <div className={styles.infoGrid}>
            <Field label="Finding" value={finding.code} />
            <Field label="Severity" value={titleCase(finding.severity)} />
            <Field label="Entities" value={finding.entity_ids.join(', ') || '—'} />
            <Field label="ID" value={finding.id} />
          </div>
          <p className={styles.rationale}>{finding.message}</p>
          {finding.repair_hint ? <p className={styles.hint}>{finding.repair_hint}</p> : null}
          <CodeBlock value={finding.evidence} />
        </div>
      );
    }
  }

  return (
    <div className={styles.detail}>
      <EmptyState
        title="No typed record"
        body="This selection is still committing, or its artifact is unavailable. The event ledger remains authoritative."
        icon={<Info size={14} />}
      />
    </div>
  );
}
