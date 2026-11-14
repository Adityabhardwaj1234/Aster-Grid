import { useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  GitFork,
  Info,
  Printer,
  Radio,
  ShieldCheck,
} from 'lucide-react';

import {
  downloadText,
  formatMinutes,
  formatNumber,
  formatPct,
  formatTimestamp,
  isoNow,
  shortHash,
  statusLabel,
  titleCase,
} from '../../lib/format';
import { useAppStore } from '../../store/useAppStore';
import Modal from '../Modal';
import { CopyButton, EmptyState, StatusPill } from '../Controls';
import styles from './ReportModal.module.css';

export default function ReportModal() {
  const report = useAppStore((state) => state.artifacts.report ?? state.bundle?.report ?? null);
  const manifest = useAppStore(
    (state) => state.artifacts.manifest ?? state.run?.manifest ?? null,
  );
  const markdown = useAppStore((state) => state.reportMarkdown || report?.markdown || '');
  const run = useAppStore((state) => state.run);
  const events = useAppStore((state) => state.events);
  const setModal = useAppStore((state) => state.setModal);
  const setInspectorTab = useAppStore((state) => state.setInspectorTab);
  const close = () => setModal(null);
  const filename = useMemo(
    () => `astergrid-${(run?.id ?? report?.run_id ?? 'report').slice(0, 16)}`,
    [report?.run_id, run?.id],
  );
  const errorCount = report?.findings.filter((finding) => finding.severity === 'error').length ?? 0;
  const warningCount =
    report?.findings.filter((finding) => finding.severity === 'warning').length ?? 0;
  const exportJson = () => {
    downloadText(
      `${filename}.json`,
      JSON.stringify(
        {
          exported_at: isoNow(),
          product: 'ASTERGRID',
          note: 'Synthetic emergency-response scenario evidence. Not for real-world operations.',
          report,
          manifest,
          markdown,
        },
        null,
        2,
      ),
      'application/json',
    );
  };

  const print = () => {
    window.setTimeout(() => window.print(), 80);
  };

  if (!report) {
    return (
      <Modal
        title="Evidence report"
        eyebrow="Commit-gated output"
        onClose={close}
        size="lg"
        footer={
          <div className={styles.footer}>
            <span>
              <Info size={10} />
              Reports are emitted only after the simulated outcome is verified.
            </span>
          </div>
        }
      >
        <div className={styles.unavailable}>
          <EmptyState
            title="Report not committed yet"
            body={
              run
                ? `The run is ${statusLabel(run.status).toLowerCase()}. The reporter commits a typed report only after the outcome gate settles. The event ledger and current findings remain available.`
                : 'Select a completed run to inspect its structured report.'
            }
            icon={<FileText size={16} />}
          />
          <div className={styles.unavailableActions}>
            <button
              type="button"
              onClick={() => {
                setInspectorTab('findings');
                close();
              }}
            >
              <ShieldCheck size={11} /> Review live findings
            </button>
            <button
              type="button"
              onClick={() => {
                setInspectorTab('events');
                close();
              }}
            >
              <Radio size={11} /> Open event ledger
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Evidence report"
      eyebrow={`Run ${shortHash(report.run_id, 18)} / reproducible bundle`}
      onClose={close}
      size="xl"
      className={styles.reportDialog}
      footer={
        <div className={styles.footer}>
          <span>
            <ShieldCheck size={10} />
            {report.findings.length === 0
              ? 'No open findings at commit'
              : `${errorCount} error · ${warningCount} warning findings retained in history`}
          </span>
          <span>
            <Radio size={10} /> {events.length} events · {report.model_calls} model calls
          </span>
        </div>
      }
    >
      <div className={styles.toolbar}>
        <div className={styles.toolbarMeta}>
          <span className="eyebrow">Structured evidence</span>
          <strong>{report.title}</strong>
          <span>
            Generated {formatTimestamp(report.generated_at)} · {titleCase(report.effective_mode)} path
          </span>
        </div>
        <div className={styles.toolbarActions}>
          <button
            type="button"
            onClick={() => downloadText(`${filename}.md`, markdown || report.markdown, 'text/markdown')}
            disabled={!markdown && !report.markdown}
          >
            <Download size={11} /> Markdown
          </button>
          <button type="button" onClick={exportJson}>
            <Download size={11} /> JSON
          </button>
          <button type="button" onClick={print}>
            <Printer size={11} /> Print
          </button>
        </div>
      </div>

      <div className={`${styles.printArea} print-root`}>
        <section className={styles.cover}>
          <div className={styles.coverMark} aria-hidden="true">
            <img src="/brand/astergrid-mark-64.png" alt="" />
          </div>
          <div className={styles.coverCopy}>
            <span className={styles.classification}>Synthetic / fictional scenario</span>
            <h1>{report.title}</h1>
            <p>{report.narrative[0] ?? 'Deterministic response outcome report.'}</p>
            <div className={styles.coverMeta}>
              <span>
                <span>Run</span>
                <strong>{report.run_id}</strong>
              </span>
              <span>
                <span>Mode</span>
                <strong>
                  {titleCase(manifest?.requested_mode ?? report.execution_mode)} →{' '}
                  {titleCase(report.effective_mode)}
                </strong>
              </span>
              <span>
                <span>Generated</span>
                <strong>{formatTimestamp(report.generated_at)}</strong>
              </span>
              <span>
                <span>Outcome</span>
                <strong>{run ? statusLabel(run.status) : 'Committed'}</strong>
              </span>
            </div>
          </div>
        </section>

        <section className={styles.metricsGrid} aria-label="Outcome metrics">
          <div>
            <span>Objective score</span>
            <strong>{formatNumber(report.metrics.objective_score, 1)}</strong>
            <small>weighted response objective</small>
          </div>
          <div>
            <span>Coverage</span>
            <strong>{formatPct(report.metrics.coverage_pct)}</strong>
            <small>{report.metrics.completed_tasks}/{report.metrics.total_tasks} tasks complete</small>
          </div>
          <div>
            <span>Delivery</span>
            <strong>{formatPct(report.metrics.delivery_pct)}</strong>
            <small>{report.metrics.unmet_demand} unmet demand</small>
          </div>
          <div>
            <span>Median response</span>
            <strong>{formatMinutes(report.metrics.median_response_min)}</strong>
            <small>{report.metrics.utilization_pct.toFixed(1)}% utilization</small>
          </div>
        </section>

        <div className={styles.twoCol}>
          <section className={styles.section}>
            <SectionHead icon={<FileText size={11} />} index="01" title="Outcome narrative" />
            {report.narrative.map((paragraph, index) => (
              <p key={index} className={styles.narrative}>
                {paragraph}
              </p>
            ))}
            <div className={styles.assumptionList}>
              <span>Assumptions</span>
              {report.assumptions.map((assumption, index) => (
                <p key={index}>{assumption}</p>
              ))}
              {!report.assumptions.length ? <p>No additional assumptions recorded.</p> : null}
            </div>
          </section>

          <section className={styles.section}>
            <SectionHead icon={<GitFork size={11} />} index="02" title="Revision history" />
            {report.revisions.length ? (
              <div className={styles.revisions}>
                {report.revisions.map((revision) => (
                  <div key={revision.attempt} className={styles.revision}>
                    <span className={styles.revisionAttempt}>R{revision.attempt}</span>
                    <div>
                      <strong>
                        {revision.trigger_stage} · {revision.trigger_codes.join(' · ')}
                      </strong>
                      {revision.changes.map((change, index) => (
                        <p key={index}>{change}</p>
                      ))}
                      <span className={styles.revisionStats}>
                        {revision.assignments_changed} assignments changed ·{' '}
                        {revision.demands_deferred} demands deferred
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.muted}>First pass passed; no revision was required.</p>
            )}
          </section>
        </div>

        <section className={styles.section}>
          <SectionHead
            icon={<ShieldCheck size={11} />}
            index="03"
            title="Findings ledger"
            aside={`${report.findings.length} records`}
          />
          {report.findings.length ? (
            <div className={styles.findings}>
              <div className={styles.findingHead}>
                <span>Severity</span>
                <span>Finding</span>
                <span>Entities</span>
              </div>
              {report.findings.map((finding) => (
                <div key={finding.id} className={styles.finding}>
                  <span className={`${styles.severity} ${styles[`severity_${finding.severity}`] ?? ''}`}>
                    {finding.severity}
                  </span>
                  <div>
                    <strong>{finding.code.replace(/_/g, ' ')}</strong>
                    <p>{finding.message}</p>
                    {finding.repair_hint ? (
                      <small>
                        Repair: {finding.repair_hint}
                      </small>
                    ) : null}
                  </div>
                  <span className={styles.entityChips}>
                    {finding.entity_ids.length
                      ? finding.entity_ids.map((id) => <em key={id}>{id}</em>)
                      : 'global'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.noFindings}>
              <CheckCircle2 size={12} /> No findings remained open at commit.
            </div>
          )}
        </section>

        <div className={styles.twoCol}>
          <section className={styles.section}>
            <SectionHead icon={<Radio size={11} />} index="04" title="Agent ledger" />
            <div className={styles.agentTable}>
              {report.agents.map((agent) => (
                <div key={agent.id} className={styles.agentRow}>
                  <span className={styles.agentId}>{agent.id}</span>
                  <div>
                    <strong>{agent.name}</strong>
                    <p>{agent.note}</p>
                  </div>
                  <span className={styles.agentMeta}>
                    <StatusPill status={agent.status} label={agent.status} />
                    <em>{formatNumber(agent.duration_ms, 0)} ms</em>
                    <em>{agent.calls} calls</em>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <SectionHead icon={<CheckCircle2 size={11} />} index="05" title="Final assignments" />
            <div className={styles.assignmentTable}>
              <div className={styles.assignmentHead}>
                <span>Assignment</span>
                <span>Asset → demand</span>
                <span>Window</span>
              </div>
              {report.assignments.map((assignment) => (
                <div key={assignment.id} className={styles.assignmentRow}>
                  <span>
                    <strong>{assignment.id}</strong>
                    <em>{assignment.route_source}</em>
                  </span>
                  <span>
                    {assignment.asset_id} → {assignment.demand_id}
                  </span>
                  <span>
                    {formatMinutes(assignment.start_min)}–{formatMinutes(assignment.end_min)}
                  </span>
                </div>
              ))}
              {report.unassigned.map((demand) => (
                <div key={demand.demand_id} className={styles.assignmentRow}>
                  <span>
                    <strong>{demand.demand_id}</strong>
                    <em>unassigned</em>
                  </span>
                  <span>{demand.reason}</span>
                  <span>priority {demand.priority}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className={styles.section}>
          <SectionHead icon={<Info size={11} />} index="06" title="Provenance & method" />
          <div className={styles.provenanceGrid}>
            <div className={styles.hashBlock}>
              <span>Hash chain</span>
              <HashLine label="World" value={report.world_hash} />
              <HashLine label="Input" value={report.input_hash} />
              <HashLine label="Simulation" value={report.simulation_hash} />
              <HashLine label="Result" value={report.result_hash} />
            </div>
            <div className={styles.hashBlock}>
              <span>Algorithm versions</span>
              {Object.entries(report.algorithm_versions).map(([key, value]) => (
                <div key={key} className={styles.versionRow}>
                  <em>{key}</em>
                  <code>{value}</code>
                </div>
              ))}
            </div>
            <div className={styles.methodBlock}>
              <span>Execution honesty</span>
              <p>
                Requested {titleCase(manifest?.requested_mode ?? report.execution_mode)}. Effective{' '}
                {titleCase(report.effective_mode)}. {report.model_calls} model call
                {report.model_calls === 1 ? '' : 's'} recorded.
              </p>
              {report.effective_mode === 'deterministic' ? (
                <p>
                  This run used deterministic policy functions and the simulation engine. No LLM was
                  called and no chain-of-thought is represented.
                </p>
              ) : (
                <p>
                  Model-backed mode was reported by the backend. Verify credentials and provider
                  configuration before relying on this evidence path.
                </p>
              )}
            </div>
          </div>
        </section>

        <footer className={styles.disclaimer}>
          <AlertTriangle size={12} />
          <div>
            <strong>Fictional environment</strong>
            <p>{report.disclaimer}</p>
            <span>
              ASTERGRID report · {report.id} · {manifest ? `manifest ${shortHash(manifest.result_hash, 18)}` : 'manifest pending'}
            </span>
          </div>
        </footer>
      </div>
    </Modal>
  );
}

function SectionHead({
  icon,
  index,
  title,
  aside,
}: {
  icon: ReactNode;
  index: string;
  title: string;
  aside?: string;
}) {
  return (
    <div className={styles.sectionHead}>
      <span>
        <i>{index}</i>
        {icon}
        {title}
      </span>
      {aside ? <span>{aside}</span> : null}
    </div>
  );
}

function HashLine({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.hashLine}>
      <em>{label}</em>
      <code>{value}</code>
      <CopyButton value={value} label="copy" />
    </div>
  );
}
