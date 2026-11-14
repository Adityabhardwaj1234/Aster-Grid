import { Clock3, Pause, Play, SkipBack, SkipForward } from 'lucide-react';

import { formatClock, formatMinutes, formatPct, statusLabel } from '../../lib/format';
import { useAppStore } from '../../store/useAppStore';
import styles from './Timeline.module.css';

const SPEEDS = [1, 2, 4];

export default function Timeline() {
  const simulation = useAppStore((state) => state.artifacts.simulation ?? null);
  const run = useAppStore((state) => state.run);
  const scenario = useAppStore((state) => state.run?.scenario ?? state.draft);
  const selectedTick = useAppStore((state) => state.selectedTick);
  const playing = useAppStore((state) => state.playing);
  const speed = useAppStore((state) => state.playbackSpeed);
  const setSelectedTick = useAppStore((state) => state.setSelectedTick);
  const setPlaying = useAppStore((state) => state.setPlaying);
  const setSpeed = useAppStore((state) => state.setPlaybackSpeed);

  const snapshots = simulation?.snapshots ?? [];
  const maxTick = snapshots.length ? snapshots[snapshots.length - 1].tick : 0;
  const current =
    snapshots.find((snapshot) => snapshot.tick === selectedTick) ??
    snapshots[snapshots.length - 1] ??
    null;
  const duration = simulation?.duration_min ?? scenario?.duration_minutes ?? 0;
  const currentTime = current?.sim_time_min ?? 0;
  const clock = current?.clock ?? (scenario ? formatClock(scenario.start_hour, currentTime) : '—');
  const canPlay = Boolean(simulation?.snapshots.length);
  const recentEvents = (simulation?.events ?? [])
    .filter((event) => event.t_min <= currentTime)
    .slice(-4)
    .reverse();
  const critical = (simulation?.events ?? []).filter(
    (event) => event.kind === 'blocked' || event.kind === 'road_closed' || event.kind === 'task_failed',
  );

  const togglePlay = () => {
    if (!canPlay) return;
    if (!playing && selectedTick >= maxTick) setSelectedTick(0);
    setPlaying(!playing);
  };

  const scrub = (tick: number) => {
    setPlaying(false);
    setSelectedTick(tick);
  };

  return (
    <section className={`${styles.timeline} ag-panel`} aria-label="Simulation timeline">
      <div className={styles.controls}>
        <div className={styles.playGroup}>
          <button
            type="button"
            className={styles.jump}
            aria-label="Jump to start"
            title="Jump to start"
            disabled={!canPlay}
            onClick={() => scrub(0)}
          >
            <SkipBack size={11} />
          </button>
          <button
            type="button"
            className={styles.play}
            aria-label={playing ? 'Pause replay' : 'Play replay'}
            title={playing ? 'Pause replay' : 'Play replay'}
            disabled={!canPlay}
            onClick={togglePlay}
          >
            {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
          </button>
          <button
            type="button"
            className={styles.jump}
            aria-label="Jump to end"
            title="Jump to end"
            disabled={!canPlay}
            onClick={() => scrub(maxTick)}
          >
            <SkipForward size={11} />
          </button>
        </div>
        <div className={styles.timeBlock}>
          <span className={styles.clock}>
            {clock}
            <small>LOCAL SIM</small>
          </span>
          <span className={styles.elapsed}>
            T+{formatMinutes(currentTime)} / {formatMinutes(duration)}
          </span>
        </div>
        <div className={styles.speed} role="group" aria-label="Playback speed">
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              className={value === speed ? styles.speedActive : ''}
              aria-pressed={value === speed}
              onClick={() => setSpeed(value)}
            >
              {value}×
            </button>
          ))}
        </div>
      </div>

      <div className={styles.scrubber}>
        <div className={styles.scrubHead}>
          <span>
            <Clock3 size={9} />
            Replay timeline
          </span>
          <span>
            tick {selectedTick}/{maxTick || '—'}
            {current?.metrics ? ` · ${formatPct(current.metrics.coverage_pct)} coverage` : ''}
          </span>
        </div>
        <div className={styles.trackWrap}>
          <div className={styles.bars} aria-hidden="true">
            {snapshots.length ? (
              snapshots.map((snapshot) => (
                <span
                  key={snapshot.tick}
                  style={{
                    height: `${Math.max(12, (snapshot.metrics.completed_tasks / Math.max(1, snapshot.metrics.total_tasks)) * 100)}%`,
                    opacity: snapshot.tick <= selectedTick ? 0.8 : 0.2,
                  }}
                />
              ))
            ) : (
              Array.from({ length: 32 }, (_, index) => (
                <span key={index} style={{ height: '10%', opacity: 0.12 }} />
              ))
            )}
          </div>
          <div className={styles.rail} aria-hidden="true" />
          <div className={styles.eventMarks} aria-hidden="true">
            {(simulation?.events ?? []).map((event) => {
              const left = duration ? (event.t_min / duration) * 100 : 0;
              const criticalEvent =
                event.kind === 'blocked' ||
                event.kind === 'road_closed' ||
                event.kind === 'task_failed';
              return (
                <span
                  key={event.id}
                  className={criticalEvent ? styles.eventMarkCritical : styles.eventMark}
                  style={{ left: `${left}%` }}
                  title={`${formatMinutes(event.t_min)} · ${event.message}`}
                />
              );
            })}
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(1, maxTick)}
            step={1}
            value={selectedTick}
            disabled={!canPlay}
            onChange={(event) => scrub(Number(event.target.value))}
            aria-label="Simulation tick"
            aria-valuetext={`Tick ${selectedTick} of ${maxTick}, ${clock}`}
            className={styles.range}
            style={{
              backgroundSize: `${maxTick ? (selectedTick / maxTick) * 100 : 0}% 100%`,
            }}
          />
          <div className={styles.playhead} style={{ left: `${maxTick ? (selectedTick / maxTick) * 100 : 0}%` }} aria-hidden="true">
            <span />
          </div>
        </div>
        <div className={styles.axis} aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <span key={fraction}>
              {scenario
                ? formatClock(scenario.start_hour, duration * fraction)
                : formatMinutes(duration * fraction)}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.now}>
        <div className={styles.nowHead}>
          <span className={styles.nowDot} aria-hidden="true" />
          <span>{current ? `Tick ${current.tick}` : 'Awaiting simulation'}</span>
        </div>
        <div className={styles.nowMetrics}>
          <div>
            <span>Complete</span>
            <strong>
              {current ? `${current.metrics.completed_tasks}/${current.metrics.total_tasks}` : '—'}
            </strong>
          </div>
          <div>
            <span>Unmet</span>
            <strong className={current?.metrics.unmet_demand ? styles.warn : ''}>
              {current?.metrics.unmet_demand ?? '—'}
            </strong>
          </div>
          <div>
            <span>Events</span>
            <strong>{current?.event_ids.length ?? '—'}</strong>
          </div>
        </div>
        <div className={styles.ticker}>
          {recentEvents.length ? (
            recentEvents.slice(0, 2).map((event) => (
              <div key={event.id} className={styles.tickerRow}>
                <span>{formatMinutes(event.t_min)}</span>
                <p>{event.message}</p>
              </div>
            ))
          ) : (
            <div className={styles.tickerRow}>
              <span>{run ? statusLabel(run.status) : 'standby'}</span>
              <p>
                {critical.length
                  ? `${critical.length} critical simulation events captured.`
                  : 'Validated simulation snapshots will populate this replay.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
