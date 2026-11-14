import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Map, Network, Radio, ScrollText, ShieldAlert, X } from 'lucide-react';

import { statusLabel } from '../lib/format';
import { useAppStore } from '../store/useAppStore';
import AgentGraphModal from './modals/AgentGraphModal';
import GanttModal from './modals/GanttModal';
import ReportModal from './modals/ReportModal';
import SceneView from './SceneView';
import AgentRail from './commands/AgentRail';
import BriefPanel from './commands/BriefPanel';
import CommandHeader from './commands/CommandHeader';
import InspectorPanel from './commands/InspectorPanel';
import MetricsPanel from './commands/MetricsPanel';
import Timeline from './commands/Timeline';
import styles from './CommandCenter.module.css';

type MobileTab = 'scene' | 'brief' | 'evidence';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);
  return matches;
}

export default function CommandCenter() {
  const run = useAppStore((state) => state.run);
  const simulation = useAppStore((state) => state.artifacts.simulation ?? null);
  const playing = useAppStore((state) => state.playing);
  const speed = useAppStore((state) => state.playbackSpeed);
  const selectedTick = useAppStore((state) => state.selectedTick);
  const modal = useAppStore((state) => state.modal);
  const streamState = useAppStore((state) => state.streamState);
  const runError = useAppStore((state) => state.runError);
  const connectionError = useAppStore((state) => state.connectionError);
  const lastValidatedBundle = useAppStore((state) => state.lastValidatedBundle);
  const activeRunId = useAppStore((state) => state.activeRunId);
  const setSelectedTick = useAppStore((state) => state.setSelectedTick);
  const setPlaying = useAppStore((state) => state.setPlaying);
  const setModal = useAppStore((state) => state.setModal);
  const selectEntity = useAppStore((state) => state.selectEntity);
  const focusSelection = useAppStore((state) => state.focusSelection);
  const restoreLastValidated = useAppStore((state) => state.restoreLastValidated);
  const setToast = useAppStore((state) => state.setToast);
  const compact = useMediaQuery('(max-width: 1180px)');
  const [mobileTab, setMobileTab] = useState<MobileTab>('scene');
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  const maxTick = simulation?.snapshots.length
    ? simulation.snapshots[simulation.snapshots.length - 1].tick
    : 0;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    if (!simulation?.snapshots.length) {
      if (playing) setPlaying(false);
      return;
    }
    if (!playing) return;
    const timer = window.setInterval(() => {
      const state = useAppStore.getState();
      const snapshots = state.artifacts.simulation?.snapshots ?? [];
      const max = snapshots.length ? snapshots[snapshots.length - 1].tick : 0;
      if (state.selectedTick >= max) {
        setPlaying(false);
        return;
      }
      setSelectedTick(state.selectedTick + 1);
    }, Math.max(140, 920 / speed));
    return () => window.clearInterval(timer);
  }, [playing, setPlaying, setSelectedTick, simulation, speed]);

  useEffect(() => {
    if (simulation && selectedTick > maxTick) setSelectedTick(maxTick);
  }, [maxTick, selectedTick, setSelectedTick, simulation]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (modal) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          'input, textarea, select, button, a, [contenteditable="true"], [role="button"], [role="slider"]',
        )
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (event.code === 'Space') {
        if (!simulation?.snapshots.length) return;
        event.preventDefault();
        if (!playing && selectedTick >= maxTick) setSelectedTick(0);
        setPlaying(!playing);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setPlaying(false);
        setSelectedTick(Math.max(0, selectedTick - 1));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setPlaying(false);
        setSelectedTick(Math.min(maxTick, selectedTick + 1));
      } else if (key === 'g') {
        setModal('agents');
      } else if (key === 'r') {
        setModal('report');
      } else if (key === 't') {
        setModal('gantt');
      } else if (key === 'f') {
        focusSelection();
      } else if (event.key === 'Escape') {
        selectEntity(null);
      } else if (event.key === '?') {
        setToast('Shortcuts: Space replay · ←/→ scrub · G agent graph · T Gantt · R report · F focus · Esc clear');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    focusSelection,
    maxTick,
    modal,
    playing,
    selectEntity,
    selectedTick,
    setModal,
    setPlaying,
    setSelectedTick,
    setToast,
    simulation,
  ]);

  useEffect(() => {
    if (!compact && mobileTab !== 'scene') setMobileTab('scene');
  }, [compact, mobileTab]);

  const shownError = runError ?? (streamState === 'error' ? connectionError : null);
  const canRestore =
    Boolean(lastValidatedBundle) &&
    Boolean(activeRunId) &&
    lastValidatedBundle?.run.id !== activeRunId;

  return (
    <div className={styles.root}>
      <CommandHeader />

      {shownError && shownError !== dismissedError ? (
        <div className={styles.errorBar} role="alert">
          <AlertTriangle size={13} />
          <span>{shownError}</span>
          {canRestore ? (
            <button
              type="button"
              onClick={() => {
                restoreLastValidated();
                setDismissedError(shownError);
              }}
            >
              Restore last validated scene
            </button>
          ) : null}
          <button
            type="button"
            className={styles.errorClose}
            onClick={() => setDismissedError(shownError)}
            aria-label="Dismiss error"
          >
            <X size={11} />
          </button>
        </div>
      ) : null}

      {streamState === 'reconnecting' ? (
        <div className={styles.reconnectBar} role="status">
          <Radio size={11} />
          Event stream reconnecting. Sequence resumption is keyed to the last acknowledged event.
        </div>
      ) : null}

      <div className={`${styles.body} ${compact ? styles.compactBody : ''}`}>
        {!compact ? (
          <aside className={styles.leftRail} aria-label="Scenario and agents">
            <BriefPanel />
            <AgentRail />
          </aside>
        ) : null}

        <main
          className={`${styles.centerColumn} ${
            compact && mobileTab !== 'scene' ? styles.mobileHidden : ''
          }`}
          aria-label="Operational scene and replay"
        >
          <SceneView active={!compact || mobileTab === 'scene'} />
          <Timeline />
        </main>

        {!compact ? (
          <aside className={styles.rightRail} aria-label="Metrics and evidence">
            <MetricsPanel />
            <InspectorPanel />
          </aside>
        ) : null}

        {compact && mobileTab === 'brief' ? (
          <div className={styles.mobilePanel} role="region" aria-label="Scenario brief and agents">
            <BriefPanel />
            <AgentRail />
          </div>
        ) : null}

        {compact && mobileTab === 'evidence' ? (
          <div className={styles.mobilePanel} role="region" aria-label="Response metrics and evidence">
            <MetricsPanel />
            <InspectorPanel />
          </div>
        ) : null}
      </div>

      {compact ? (
        <nav className={styles.mobileDock} aria-label="Command center views">
          <button
            type="button"
            className={mobileTab === 'scene' ? styles.dockActive : ''}
            onClick={() => setMobileTab('scene')}
            aria-pressed={mobileTab === 'scene'}
          >
            <Map size={14} />
            Scene
          </button>
          <button
            type="button"
            className={mobileTab === 'brief' ? styles.dockActive : ''}
            onClick={() => setMobileTab('brief')}
            aria-pressed={mobileTab === 'brief'}
          >
            <ScrollText size={14} />
            Brief
          </button>
          <button
            type="button"
            className={mobileTab === 'evidence' ? styles.dockActive : ''}
            onClick={() => setMobileTab('evidence')}
            aria-pressed={mobileTab === 'evidence'}
          >
            <ShieldAlert size={14} />
            Evidence
          </button>
          <button type="button" onClick={() => setModal('agents')}>
            <Network size={14} />
            Agents
          </button>
        </nav>
      ) : null}

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {run
          ? `Run ${statusLabel(run.status)}. Current role ${run.current_agent ?? 'none'}. Replay tick ${selectedTick} of ${maxTick}.`
          : 'Run state loading.'}
      </div>

      <span className={styles.liveMark} aria-hidden="true">
        <Activity size={8} />
        ASTERGRID / LOCAL
      </span>

      {modal === 'agents' ? <AgentGraphModal /> : null}
      {modal === 'gantt' ? <GanttModal /> : null}
      {modal === 'report' ? <ReportModal /> : null}
    </div>
  );
}
