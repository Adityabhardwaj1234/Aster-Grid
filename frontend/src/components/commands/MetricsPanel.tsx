import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CloudRain,
  Gauge,
  Route,
  ShieldCheck,
  Wind,
} from 'lucide-react';
import type { CSSProperties } from 'react';

import {
  formatMinutes,
  formatNumber,
  formatPct,
  shortHash,
  statusLabel,
} from '../../lib/format';
import { useAppStore } from '../../store/useAppStore';
import { PanelTitle, StatusPill } from '../Controls';
import styles from './MetricsPanel.module.css';

export default function MetricsPanel() {
  const run = useAppStore((state) => state.run);
  const simulation = useAppStore((state) => state.artifacts.simulation ?? null);
  const snapshot = useAppStore((state) => {
    const sim = state.artifacts.simulation;
    if (!sim?.snapshots?.length) return null;
    return (
      sim.snapshots.find((candidate) => candidate.tick === state.selectedTick) ??
      sim.snapshots[sim.snapshots.length - 1]
    );
  });
  const report = useAppStore((state) => state.artifacts.report ?? state.bundle?.report ?? null);
  const preflight = useAppStore((state) => state.artifacts.preflight ?? null);
  const outcome = useAppStore((state) => state.artifacts.outcome ?? null);
  const proposal = useAppStore((state) => state.artifacts.proposal ?? null);
  const conditions = useAppStore((state) => state.artifacts.conditions ?? null);

  const metrics = snapshot?.metrics ?? simulation?.metrics ?? report?.metrics ?? null;
  const closedRoads = snapshot?.roads.filter((road) => road.status === 'closed').length ?? null;
  const unassigned = proposal?.unassigned.length ?? report?.unassigned.length ?? null;
  const checks = preflight || outcome ? `${preflight?.checked_count ?? 0}+${outcome?.checked_count ?? 0}` : '—';
  const score = metrics?.objective_score ?? null;
  const ringStyle = { '--score': `${Math.max(0, Math.min(100, score ?? 0)) * 3.6}deg` } as CSSProperties;

  return (
    <section className={`${styles.panel} ag-panel`} aria-labelledby="metrics-title">
      <PanelTitle
        eyebrow="Live outcome / 03"
        title="Response metrics"
        id="metrics-title"
        right={
          <span className={styles.clock}>
            <Activity size={10} />
            {snapshot ? `T+${formatMinutes(snapshot.sim_time_min)}` : 'Awaiting sim'}
          </span>
        }
      />

      <div className={styles.scoreRow}>
        <div className={styles.scoreRing} style={ringStyle} aria-label={score === null ? 'Objective score pending' : `Objective score ${formatNumber(score, 1)}`}>
          <div>
            <strong>{score === null ? '—' : formatNumber(score, 1)}</strong>
            <span>objective</span>
          </div>
        </div>
        <div className={styles.scoreFacts}>
          <div>
            <span>Tasks complete</span>
            <strong>
              {metrics ? `${metrics.completed_tasks}/${metrics.total_tasks}` : '—'}
            </strong>
          </div>
          <div>
            <span>Unassigned</span>
            <strong className={unassigned ? styles.warn : ''}>{unassigned ?? '—'}</strong>
          </div>
          <div>
            <span>Verification checks</span>
            <strong>{checks}</strong>
          </div>
          <div>
            <span>Revisions</span>
            <strong>{run?.revision_count ?? report?.revisions.length ?? '—'}</strong>
          </div>
        </div>
      </div>

      <div className={styles.kpiGrid}>
        <div>
          <span>Coverage</span>
          <strong>{metrics ? formatPct(metrics.coverage_pct) : '—'}</strong>
          <div className={styles.track}>
            <span style={{ width: `${metrics?.coverage_pct ?? 0}%` }} />
          </div>
        </div>
        <div>
          <span>Delivery</span>
          <strong>{metrics ? formatPct(metrics.delivery_pct) : '—'}</strong>
          <div className={styles.track}>
            <span style={{ width: `${metrics?.delivery_pct ?? 0}%` }} />
          </div>
        </div>
        <div>
          <span>Median response</span>
          <strong>{metrics ? formatMinutes(metrics.median_response_min) : '—'}</strong>
          <div className={styles.track}>
            <span
              style={{
                width: metrics
                  ? `${Math.max(0, 100 - Math.min(100, metrics.median_response_min))}%`
                  : '0%',
              }}
            />
          </div>
        </div>
        <div>
          <span>Utilization</span>
          <strong>{metrics ? formatPct(metrics.utilization_pct) : '—'}</strong>
          <div className={styles.track}>
            <span style={{ width: `${metrics?.utilization_pct ?? 0}%` }} />
          </div>
        </div>
      </div>

      <div className={styles.signalRow}>
        <div>
          <Route size={11} />
          <span>Closed roads</span>
          <strong>{closedRoads ?? conditions?.closed_edge_ids.length ?? '—'}</strong>
        </div>
        <div>
          <CloudRain size={11} />
          <span>Water stage</span>
          <strong>
            {snapshot
              ? `${snapshot.hazard.water_level_m.toFixed(1)} m`
              : conditions
                ? `${conditions.water_level_at_horizon_m.toFixed(1)} m`
                : '—'}
          </strong>
        </div>
        <div>
          <Wind size={11} />
          <span>Wind</span>
          <strong>
            {snapshot
              ? `${Math.round(snapshot.hazard.wind_kph)} kph`
              : `${run?.scenario.weather.wind_kph ?? '—'} kph`}
          </strong>
        </div>
      </div>

      <div className={styles.verifyBlock}>
        <div className={styles.verifyHead}>
          <span>
            <ShieldCheck size={10} />
            Verification spine
          </span>
          <span>{run ? statusLabel(run.status) : 'Standby'}</span>
        </div>
        <div className={styles.verifyRow}>
          <span>Preflight</span>
          {preflight ? (
            <StatusPill status={preflight.passed ? 'ok' : 'needs_attention'} label={preflight.passed ? 'Passed' : 'Findings'} />
          ) : (
            <span className={styles.pending}>Pending</span>
          )}
          <span className={styles.verifyMeta}>
            {preflight ? `${preflight.findings.length} findings` : '—'}
          </span>
        </div>
        <div className={styles.verifyRow}>
          <span>Outcome</span>
          {outcome ? (
            <StatusPill status={outcome.passed ? 'ok' : 'needs_attention'} label={outcome.passed ? 'Passed' : 'Findings'} />
          ) : (
            <span className={styles.pending}>Pending</span>
          )}
          <span className={styles.verifyMeta}>
            {outcome ? `${outcome.findings.length} findings` : '—'}
          </span>
        </div>
        <div className={styles.verifyRow}>
          <span>Commit gate</span>
          {run?.status === 'completed' ? (
            <StatusPill status="ok" label="Committed" />
          ) : run?.status === 'needs_attention' ? (
            <StatusPill status="needs_attention" label="Review" />
          ) : (
            <span className={styles.pending}>Awaiting</span>
          )}
          <span className={styles.verifyMeta}>
            {run?.manifest ? shortHash(run.manifest.result_hash, 9) : '—'}
          </span>
        </div>
      </div>

      <div className={styles.footer}>
        <span>
          <Gauge size={10} />
          {run?.model_calls ?? report?.model_calls ?? 0} model calls
        </span>
        <span className={styles.integrity}>
          {run?.manifest ? (
            <>
              <CheckCircle2 size={10} /> Manifest bound
            </>
          ) : (
            <>
              <AlertTriangle size={10} /> Manifest pending
            </>
          )}
        </span>
      </div>
    </section>
  );
}
