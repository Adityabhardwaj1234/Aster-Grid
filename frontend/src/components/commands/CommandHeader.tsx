import { ArrowLeft, BarChart3, FileText, Network, Radio, Square } from 'lucide-react';

import { formatMinutes, shortHash, statusLabel, titleCase } from '../../lib/format';
import { useAppStore } from '../../store/useAppStore';
import Brand from '../Brand';
import { IconButton, StatusPill } from '../Controls';
import styles from './CommandHeader.module.css';

export default function CommandHeader() {
  const run = useAppStore((state) => state.run);
  const draft = useAppStore((state) => state.draft);
  const meta = useAppStore((state) => state.meta);
  const events = useAppStore((state) => state.events);
  const streamState = useAppStore((state) => state.streamState);
  const setModal = useAppStore((state) => state.setModal);
  const cancelCurrentRun = useAppStore((state) => state.cancelCurrentRun);
  const returnToLaunch = useAppStore((state) => state.returnToLaunch);
  const openBuilder = useAppStore((state) => state.openBuilder);

  const scenario = run?.scenario ?? draft;
  const running = run ? ['queued', 'running'].includes(run.status) : false;
  const seq = events.reduce((max, event) => Math.max(max, event.seq), 0);
  const status = run?.status ?? 'queued';

  const startFresh = () => {
    returnToLaunch();
    openBuilder();
  };

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button
          type="button"
          className={styles.brandButton}
          onClick={returnToLaunch}
          aria-label="Return to ASTERGRID overview"
          title="Return to overview"
        >
          <ArrowLeft size={13} className={styles.backIcon} />
          <Brand compact />
        </button>

        <span className={styles.divider} aria-hidden="true" />

        <div className={styles.scenario}>
          <div className={styles.scenarioTop}>
            <span className={styles.scenarioType}>
              {scenario ? titleCase(scenario.scenario_type) : 'Synthetic operation'}
            </span>
            <span className={styles.scenarioSeed}>
              {scenario ? `RB / ${scenario.seed}` : 'NO DRAFT'}
            </span>
          </div>
          <div className={styles.scenarioTitleRow}>
            <h1>{scenario?.name ?? 'Loading scenario…'}</h1>
            <StatusPill status={status} pulse={running} />
          </div>
          <div className={styles.scenarioMeta}>
            <span>{scenario ? formatMinutes(scenario.duration_minutes) : '—'}</span>
            <span>{run ? shortHash(run.id, 18) : 'Uncommitted'}</span>
            <span className={styles.mode}>{meta?.execution_mode === 'gemini' ? 'Gemini' : 'Rules'}</span>
          </div>
        </div>
      </div>

      <div className={styles.center} aria-label="Execution status">
        <div className={styles.liveCell}>
          <span
            className={`${styles.liveDot} ${
              streamState === 'live' ? styles.live : styles.quiet
            }`}
            aria-hidden="true"
          />
          <div>
            <span>Event ledger</span>
            <strong>
              {streamState === 'live'
                ? 'Streaming'
                : streamState === 'reconnecting'
                  ? 'Reconnecting'
                  : streamState === 'connecting'
                    ? 'Connecting'
                    : running
                      ? 'Polling'
                      : 'Settled'}
            </strong>
          </div>
        </div>
        <div className={styles.liveCell}>
          <Radio size={12} />
          <div>
            <span>Sequence</span>
            <strong>#{String(seq).padStart(4, '0')}</strong>
          </div>
        </div>
        <div className={styles.liveCell}>
          <div>
            <span>Current role</span>
            <strong className={styles.currentAgent}>
              {run?.current_agent ? titleCase(run.current_agent) : statusLabel(status)}
            </strong>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          onClick={() => setModal('agents')}
          title="Open the live agent dependency graph"
        >
          <Network size={13} />
          <span>Graph</span>
        </button>
        <button
          type="button"
          className={styles.action}
          onClick={() => setModal('gantt')}
          title="Open execution Gantt"
        >
          <BarChart3 size={13} />
          <span>Gantt</span>
        </button>
        <button
          type="button"
          className={styles.action}
          onClick={() => setModal('report')}
          title="Open evidence report"
        >
          <FileText size={13} />
          <span>Report</span>
        </button>
        <span className={styles.actionDivider} aria-hidden="true" />
        {running ? (
          <IconButton
            label="Cancel run"
            danger
            onClick={() => void cancelCurrentRun()}
            className={styles.cancel}
          >
            <Square size={12} fill="currentColor" />
          </IconButton>
        ) : (
          <button type="button" className={styles.newRun} onClick={startFresh}>
            New scenario
          </button>
        )}
      </div>
    </header>
  );
}
