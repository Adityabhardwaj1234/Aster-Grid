import { useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowRight,
  Clock3,
  Compass,
  Database,
  FileJson,
  GitBranch,
  Layers3,
  Play,
  Radar,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { formatTimestamp, shortHash, statusLabel } from '../lib/format';
import { useAppStore } from '../store/useAppStore';
import Brand from './Brand';
import { StatusPill } from './Controls';
import ScenarioBuilder from './ScenarioBuilder';
import styles from './LaunchScreen.module.css';

const PIPELINE = [
  {
    index: '01',
    title: 'Configure',
    body: 'Shape a synthetic world: terrain, hazard, districts, windows, and resources.',
    icon: Compass,
  },
  {
    index: '02',
    title: 'Parallelize',
    body: 'Conditions, Resources, and Accessibility execute as real concurrent ADK branches.',
    icon: GitBranch,
  },
  {
    index: '03',
    title: 'Verify',
    body: 'Preflight blocks impossible routes, then bounded revisions repair the plan.',
    icon: ShieldCheck,
  },
  {
    index: '04',
    title: 'Commit',
    body: 'Deterministic simulation proves the outcome before the scene turns validated.',
    icon: Database,
  },
];

const HERO_METRICS = [
  { value: '04', label: 'Scenario worlds' },
  { value: '09', label: 'Agent roles' },
  { value: '09', label: 'View presets' },
  { value: '00', label: 'Keys required' },
];

export default function LaunchScreen() {
  const meta = useAppStore((state) => state.meta);
  const presets = useAppStore((state) => state.presets);
  const recentRuns = useAppStore((state) => state.recentRuns);
  const builderOpen = useAppStore((state) => state.builderOpen);
  const selectedPresetId = useAppStore((state) => state.selectedPresetId);
  const openBuilder = useAppStore((state) => state.openBuilder);
  const choosePreset = useAppStore((state) => state.choosePreset);
  const loadRun = useAppStore((state) => state.loadRun);
  const [recentExpanded, setRecentExpanded] = useState(false);

  const latest = recentRuns[0];
  const visibleRuns = recentExpanded ? recentRuns : recentRuns.slice(0, 3);
  const selected = presets.find((preset) => preset.id === selectedPresetId) ?? presets[0];

  const launchPreset = (presetId: string) => {
    choosePreset(presetId);
    openBuilder();
  };

  return (
    <div className={styles.root}>
      <div className={styles.hero}>
        <div className={styles.heroImage} aria-hidden="true" />
        <div className={styles.heroVeil} aria-hidden="true" />
        <div className={styles.heroGrid} aria-hidden="true" />
        <div className={styles.scanline} aria-hidden="true" />

        <header className={styles.nav}>
          <Brand />
          <nav className={styles.navLinks} aria-label="Primary">
            <a href="#scenarios">Scenarios</a>
            <a href="#method">Method</a>
            <a href="#evidence">Evidence</a>
          </nav>
          <div className={styles.navRight}>
            <span className={styles.localStatus}>
              <span aria-hidden="true" />
              Local service ready
            </span>
            <button type="button" className={styles.navCta} onClick={openBuilder}>
              Compose
              <ArrowRight size={13} />
            </button>
          </div>
        </header>

        <main className={styles.heroBody}>
          <div className={styles.heroCopy}>
            <div className={styles.kickerRow}>
              <span className="eyebrow">Synthetic command lab / 01</span>
              <span className={styles.kickerRule} aria-hidden="true" />
              <span className={styles.kickerTag}>Local-first</span>
            </div>

            <h1>
              See the whole response.
              <span>Verify every decision.</span>
            </h1>

            <p className={styles.heroLede}>
              A 3D scenario intelligence lab where a real Google ADK workflow coordinates
              specialist agents over a deterministic world. Every route, revision, and
              outcome stays traceable.
            </p>

            <div className={styles.ctaRow}>
              <button
                type="button"
                className={styles.primaryCta}
                onClick={() => (selected ? launchPreset(selected.id) : openBuilder())}
              >
                <span className={styles.ctaIcon}>
                  <Play size={13} fill="currentColor" />
                </span>
                Open scenario builder
                <ArrowRight size={15} />
              </button>
              {latest ? (
                <button
                  type="button"
                  className={styles.secondaryCta}
                  onClick={() => void loadRun(latest.id)}
                >
                  Resume last analysis
                  <span className={styles.resumeMeta}>{statusLabel(latest.status)}</span>
                </button>
              ) : (
                <a className={styles.secondaryCta} href="#method">
                  Inspect the method
                  <ArrowRight size={14} />
                </a>
              )}
            </div>

            <div className={styles.modeRow}>
              <span className={styles.modeActive}>
                <span aria-hidden="true" />
                Rules mode
                <small>Deterministic · fully testable</small>
              </span>
              <span
                className={styles.modeInactive}
                title={
                  meta?.gemini_configured
                    ? 'Gemini mode is configured on this server.'
                    : 'Requires a server-side API key. No live model was used for this build.'
                }
              >
                <span aria-hidden="true" />
                Gemini mode
                <small>
                  {meta?.gemini_configured ? 'Configured · opt-in' : 'Requires server key'}
                </small>
              </span>
            </div>
          </div>

          <aside className={styles.heroAside} aria-label="System overview">
            <div className={styles.asideCard}>
              <div className={styles.asideHead}>
                <span className="eyebrow">Live stack</span>
                <Radar size={15} />
              </div>
              <div className={styles.stack}>
                <div>
                  <span>ADK graph</span>
                  <strong>2.12</strong>
                </div>
                <div>
                  <span>Execution</span>
                  <strong className={styles.good}>Deterministic</strong>
                </div>
                <div>
                  <span>Verification</span>
                  <strong>1.0</strong>
                </div>
                <div>
                  <span>Model calls</span>
                  <strong>0</strong>
                </div>
              </div>
              <div className={styles.asideFoot}>
                <ShieldCheck size={13} />
                <p>
                  No fabricated tool calls. No simulated progress. Every status originates
                  from the server event ledger.
                </p>
              </div>
            </div>

            <div className={styles.radarCard} aria-hidden="true">
              <div className={styles.radarRingOuter}>
                <div className={styles.radarRingInner}>
                  <span className={styles.radarSweep} />
                  <span className={styles.radarCore} />
                  <span className={styles.radarBlip} />
                  <span className={styles.radarBlip2} />
                </div>
              </div>
              <div className={styles.radarLabel}>
                <span>RB-DELTA / 1847</span>
                <span>SECTOR 03</span>
              </div>
            </div>
          </aside>
        </main>

        <div className={styles.heroBottom}>
          <div className={styles.heroMetrics}>
            {HERO_METRICS.map((metric) => (
              <div key={metric.label}>
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
              </div>
            ))}
          </div>
          <div className={styles.coordStrip}>
            <span>37°12′N</span>
            <span>122°08′W</span>
            <span className={styles.coordLive}>Synthetic coordinates</span>
          </div>
          <a href="#scenarios" className={styles.scrollCue} aria-label="Scroll to scenarios">
            <span />
            Explore scenarios
          </a>
        </div>
      </div>

      <section className={styles.section} id="scenarios">
        <div className={styles.sectionHead}>
          <div>
            <span className="eyebrow">Scenario plate / 02</span>
            <h2>Four worlds. One verification spine.</h2>
          </div>
          <p>
            Start from a curated synthetic scenario or compose your own seed, hazard, and
            resource posture. The draft preview is generated by the same engine that commits
            the run.
          </p>
        </div>

        <div className={styles.presetGrid}>
          {presets.map((preset, index) => (
            <button
              key={preset.id}
              type="button"
              className={styles.presetCard}
              style={{ '--accent': preset.accent } as CSSProperties}
              onClick={() => launchPreset(preset.id)}
            >
              <div className={styles.presetTop}>
                <span className={styles.presetIndex}>{String(index + 1).padStart(2, '0')}</span>
                <span className={styles.presetType}>{preset.scenario_type}</span>
                <ArrowRight size={14} className={styles.presetArrow} />
              </div>
              <div
                className={styles.presetGlyph}
                aria-hidden="true"
                style={{
                  backgroundImage: `radial-gradient(circle at 55% 46%, ${preset.accent}22, transparent 42%), url(/brand/astergrid-hero.jpg)`,
                }}
              >
                <span />
              </div>
              <h3>{preset.name}</h3>
              <p>{preset.tagline}</p>
              <div className={styles.presetTags}>
                {preset.tags.slice(0, 3).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className={styles.presetFoot}>
                <span className={styles.presetHash}>
                  SEED {preset.scenario.seed} · {preset.scenario.duration_minutes} MIN
                </span>
                <span className={styles.presetOpen}>Configure</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section} id="method">
        <div className={styles.methodGrid}>
          <div className={styles.methodCopy}>
            <span className="eyebrow">Execution model / 03</span>
            <h2>Orchestration you can audit.</h2>
            <p>
              The director builds a per-run ADK <code>Workflow</code>. Conditions, Resources,
              and Accessibility fan out in parallel and genuinely overlap. A join gate waits
              for all three before preflight.
            </p>
            <div className={styles.methodProof}>
              <div>
                <strong>3</strong>
                <span>parallel branches</span>
              </div>
              <div>
                <strong>2</strong>
                <span>bounded revisions</span>
              </div>
              <div>
                <strong>2</strong>
                <span>verification gates</span>
              </div>
            </div>
          </div>

          <div className={styles.pipeline}>
            {PIPELINE.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.index} className={styles.pipelineStep}>
                  <div className={styles.pipelineRail}>
                    <span className={styles.pipelineIndex}>{step.index}</span>
                    {index < PIPELINE.length - 1 ? <span className={styles.pipelineLine} /> : null}
                  </div>
                  <div className={styles.pipelineBody}>
                    <div className={styles.pipelineTitle}>
                      <Icon size={15} />
                      <h3>{step.title}</h3>
                    </div>
                    <p>{step.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.graphStrip}>
          <div className={styles.graphLabel}>
            <GitBranch size={14} />
            <span>ADK dependency graph</span>
          </div>
          <div className={styles.graphNodes} aria-label="Agent dependency graph preview">
            {['Intake', 'World', 'Conditions', 'Resources', 'Access', 'Critic', 'Simulation'].map(
              (node, index) => (
                <span
                  key={node}
                  className={styles.graphNode}
                  style={{ '--i': index } as CSSProperties}
                >
                  <i aria-hidden="true" />
                  {node}
                </span>
              ),
            )}
          </div>
          <span className={styles.graphFoot}>JOIN → PREFLIGHT → COMMIT</span>
        </div>
      </section>

      <section className={`${styles.section} ${styles.evidenceSection}`} id="evidence">
        <div className={styles.sectionHead}>
          <div>
            <span className="eyebrow">Evidence ledger / 04</span>
            <h2>Recent runs remain inspectable.</h2>
          </div>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => setRecentExpanded((value) => !value)}
          >
            {recentExpanded ? 'Show fewer' : `Show all ${recentRuns.length}`}
            <ArrowRight size={13} />
          </button>
        </div>

        {recentRuns.length ? (
          <div className={styles.recentList}>
            {visibleRuns.map((run) => (
              <button
                key={run.id}
                type="button"
                className={styles.recentRow}
                onClick={() => void loadRun(run.id)}
              >
                <span className={styles.recentIcon}>
                  <FileJson size={15} />
                </span>
                <span className={styles.recentMain}>
                  <span className={styles.recentTitle}>
                    {run.scenario.name}
                    <StatusPill status={run.status} />
                  </span>
                  <span className={styles.recentMeta}>
                    {run.id} · {formatTimestamp(run.created_at)} · {run.revision_count} revision
                    {run.revision_count === 1 ? '' : 's'} · {run.model_calls} model calls
                  </span>
                </span>
                <span className={styles.recentHash}>
                  <small>WORLD</small>
                  {shortHash(run.world_hash)}
                </span>
                <ArrowRight size={15} className={styles.recentArrow} />
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.emptyRecent}>
            <Layers3 size={22} />
            <div>
              <strong>No committed runs yet</strong>
              <p>Launch a scenario to create the first persisted evidence bundle.</p>
            </div>
            <button type="button" className={styles.emptyCta} onClick={openBuilder}>
              Start a run
            </button>
          </div>
        )}

        <div className={styles.evidenceNotes}>
          <div>
            <Clock3 size={14} />
            <span>SSE replay</span>
            <small>Reconnect without gaps</small>
          </div>
          <div>
            <ShieldCheck size={14} />
            <span>Hash-bound artifacts</span>
            <small>World → simulation → report</small>
          </div>
          <div>
            <FileJson size={14} />
            <span>Exportable evidence</span>
            <small>Markdown + JSON</small>
          </div>
          <div>
            <Sparkles size={14} />
            <span>No hidden chain-of-thought</span>
            <small>Typed artifacts only</small>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <Brand compact subtitle="Synthetic scenario intelligence" />
        <p>
          Synthetic scenarios only. Not for real emergency response, targeting, or
          operational decision-making. Artwork © the project owner.
        </p>
        <span className={styles.footerVersion}>v0.1.0 / LOCAL</span>
      </footer>

      {builderOpen ? <ScenarioBuilder /> : null}
    </div>
  );
}
