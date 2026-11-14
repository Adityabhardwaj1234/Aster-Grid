import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Dices,
  Gauge,
  LockKeyhole,
  Map,
  Radio,
  RotateCcw,
  Users,
  X,
} from 'lucide-react';

import { formatNumber, shortHash } from '../lib/format';
import { totalObjectiveWeight, validateScenario } from '../lib/scenario';
import { useAppStore, selectPreviewFresh } from '../store/useAppStore';
import type { ScenarioConfig } from '../types';
import Brand from './Brand';
import { Counter, RangeField, Spinner } from './Controls';
import styles from './ScenarioBuilder.module.css';

function defaultError(scenario: ScenarioConfig | null, previewError: string | null) {
  if (!scenario) return 'No scenario draft is loaded.';
  const validation = validateScenario(scenario);
  return validation.ok ? previewError : validation.errors[0];
}

export default function ScenarioBuilder() {
  const draft = useAppStore((state) => state.draft);
  const presets = useAppStore((state) => state.presets);
  const selectedPresetId = useAppStore((state) => state.selectedPresetId);
  const preview = useAppStore((state) => state.preview);
  const previewState = useAppStore((state) => state.previewState);
  const previewError = useAppStore((state) => state.previewError);
  const previewFresh = useAppStore(selectPreviewFresh);
  const meta = useAppStore((state) => state.meta);
  const starting = useAppStore((state) => state.starting);
  const closeBuilder = useAppStore((state) => state.closeBuilder);
  const choosePreset = useAppStore((state) => state.choosePreset);
  const patchDraft = useAppStore((state) => state.patchDraft);
  const patchWeather = useAppStore((state) => state.patchWeather);
  const patchResources = useAppStore((state) => state.patchResources);
  const patchObjectives = useAppStore((state) => state.patchObjectives);
  const toggleAffectedDistrict = useAppStore((state) => state.toggleAffectedDistrict);
  const startRun = useAppStore((state) => state.startRun);
  const sheetRef = useRef<HTMLDivElement>(null);

  const validation = useMemo(() => validateScenario(draft ?? ({} as ScenarioConfig)), [draft]);
  const districts = preview?.world.districts ?? [];
  const world = preview?.world;
  const canStart =
    Boolean(draft) && validation.ok && previewFresh && previewState !== 'loading' && !starting;
  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId);
  const stale = Boolean(draft && previewFresh === false && preview?.world);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeBuilder();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [closeBuilder]);

  useEffect(() => {
    sheetRef.current?.focus();
  }, []);

  const updateNumber = (key: keyof ScenarioConfig, value: number, min: number, max: number) => {
    if (!Number.isFinite(value)) return;
    patchDraft({ [key]: Math.max(min, Math.min(max, value)) } as Partial<ScenarioConfig>);
  };

  const resetPreset = () => {
    if (selectedPreset) choosePreset(selectedPreset.id);
  };

  const randomSeed = () => {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    patchDraft({ seed: values[0] % 1_000_000 });
  };

  const errorText = defaultError(draft, previewError);

  return (
    <div className={styles.overlay} role="presentation">
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="builder-title"
        tabIndex={-1}
      >
        <header className={styles.header}>
          <Brand compact subtitle="Scenario composer" />
          <div className={styles.headerCenter}>
            <span className={styles.stepLabel}>DRAFT / {selectedPreset?.name ?? 'CUSTOM'}</span>
            <span className={styles.headerRule} aria-hidden="true" />
            <span className={styles.headerNote}>Generator v1.0 · same engine as commit</span>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={closeBuilder}
            aria-label="Close scenario builder"
            autoFocus
          >
            <X size={16} />
            <span>Esc</span>
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.formColumn}>
            <div className={styles.intro}>
              <span className="eyebrow">Configure / 01</span>
              <h1 id="builder-title">Compose a synthetic response.</h1>
              <p>
                Shape the world, hazard, and resource posture. The draft hash is produced by
                the same deterministic generator that the run commits.
              </p>
            </div>

            <section className={styles.block} aria-labelledby="family-label">
              <div className={styles.blockHead}>
                <div>
                  <span className={styles.blockIndex}>01</span>
                  <h2 id="family-label">World family</h2>
                </div>
                <span className={styles.blockMeta}>{presets.length} curated presets</span>
              </div>
              <div className={styles.familyGrid}>
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`${styles.familyCard} ${
                      preset.id === selectedPresetId ? styles.familyActive : ''
                    }`}
                    onClick={() => choosePreset(preset.id)}
                    style={{ '--accent': preset.accent } as CSSProperties}
                  >
                    <span className={styles.familyType}>{preset.scenario_type}</span>
                    <strong>{preset.name}</strong>
                    <small>{preset.tagline}</small>
                    {preset.id === selectedPresetId ? (
                      <Check size={12} className={styles.familyCheck} />
                    ) : null}
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.block} aria-labelledby="scenario-label">
              <div className={styles.blockHead}>
                <div>
                  <span className={styles.blockIndex}>02</span>
                  <h2 id="scenario-label">Scenario</h2>
                </div>
                <button type="button" className={styles.reset} onClick={resetPreset}>
                  <RotateCcw size={11} />
                  Reset preset
                </button>
              </div>

              <div className={styles.nameGrid}>
                <label className={styles.field}>
                  <span>Scenario name</span>
                  <input
                    type="text"
                    value={draft?.name ?? ''}
                    maxLength={80}
                    onChange={(event) => patchDraft({ name: event.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span>Seed</span>
                  <span className={styles.seedRow}>
                    <input
                      type="number"
                      min={0}
                      max={2_147_483_647}
                      value={draft?.seed ?? 0}
                      onChange={(event) =>
                        updateNumber('seed', Number(event.target.value), 0, 2_147_483_647)
                      }
                    />
                    <button
                      type="button"
                      className={styles.seedButton}
                      onClick={randomSeed}
                      title="Draw a random seed"
                      aria-label="Draw a random seed"
                    >
                      <Dices size={13} />
                    </button>
                  </span>
                </label>
              </div>

              <div className={styles.rangeGrid}>
                <RangeField
                  label="Planning window"
                  value={draft?.duration_minutes ?? 360}
                  min={90}
                  max={720}
                  step={30}
                  onChange={(value) => patchDraft({ duration_minutes: value })}
                  format={(value) => `${Math.floor(value / 60)}h ${value % 60}m`}
                  hint="Bounded to 12 hours"
                />
                <RangeField
                  label="Start hour"
                  value={draft?.start_hour ?? 6}
                  min={0}
                  max={23}
                  onChange={(value) => patchDraft({ start_hour: value })}
                  format={(value) => `${String(value).padStart(2, '0')}:00`}
                />
                <RangeField
                  label="Disruption level"
                  value={draft?.disruption_level ?? 0.5}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(value) => patchDraft({ disruption_level: value })}
                  format={(value) => `${Math.round(value * 100)}%`}
                />
              </div>
            </section>

            <section className={styles.block} aria-labelledby="hazard-label">
              <div className={styles.blockHead}>
                <div>
                  <span className={styles.blockIndex}>03</span>
                  <h2 id="hazard-label">Hazard &amp; weather</h2>
                </div>
                <span className={styles.blockMeta}>
                  {draft?.scenario_type.replace('_', ' ')}
                </span>
              </div>
              <div className={styles.rangeGrid}>
                <RangeField
                  label="Rainfall"
                  value={draft?.weather.rainfall_mm_h ?? 0}
                  min={0}
                  max={120}
                  onChange={(value) => patchWeather({ rainfall_mm_h: value })}
                  format={(value) => `${value} mm/h`}
                />
                <RangeField
                  label="Wind"
                  value={draft?.weather.wind_kph ?? 0}
                  min={0}
                  max={140}
                  onChange={(value) => patchWeather({ wind_kph: value })}
                  format={(value) => `${value} kph`}
                />
                <RangeField
                  label="Visibility"
                  value={draft?.weather.visibility_km ?? 10}
                  min={0.2}
                  max={30}
                  step={0.1}
                  onChange={(value) => patchWeather({ visibility_km: value })}
                  format={(value) => `${value.toFixed(1)} km`}
                />
                <RangeField
                  label="Terrain saturation"
                  value={draft?.weather.terrain_saturation ?? 0}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(value) => patchWeather({ terrain_saturation: value })}
                  format={(value) => `${Math.round(value * 100)}%`}
                />
              </div>

              <div className={styles.districtBlock}>
                <div className={styles.districtHead}>
                  <span>
                    <Map size={12} />
                    Affected districts
                  </span>
                  <span>{draft?.affected_district_ids.length ?? 0} selected</span>
                </div>
                {districts.length ? (
                  <div className={styles.districtGrid}>
                    {districts.map((district) => {
                      const active = draft?.affected_district_ids.includes(district.id) ?? false;
                      return (
                        <button
                          key={district.id}
                          type="button"
                          className={`${styles.district} ${active ? styles.districtActive : ''}`}
                          onClick={() => toggleAffectedDistrict(district.id)}
                          aria-pressed={active}
                        >
                          <span className={styles.districtId}>{district.id}</span>
                          <span className={styles.districtName}>{district.name}</span>
                          <span className={styles.districtPop}>
                            {formatNumber(district.population)}
                          </span>
                          <span className={styles.districtCheck} aria-hidden="true">
                            {active ? <Check size={9} /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.districtSkeleton} aria-hidden="true">
                    {Array.from({ length: 6 }, (_, index) => (
                      <span key={index} />
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className={styles.block} aria-labelledby="resources-label">
              <div className={styles.blockHead}>
                <div>
                  <span className={styles.blockIndex}>04</span>
                  <h2 id="resources-label">Resource posture</h2>
                </div>
                <span className={styles.blockMeta}>
                  <Users size={11} /> Synthetic assets
                </span>
              </div>
              <div className={styles.resourceGrid}>
                <Counter
                  label="Rescue teams"
                  value={draft?.resources.rescue_teams ?? 0}
                  onChange={(value) => patchResources({ rescue_teams: value })}
                  max={12}
                />
                <Counter
                  label="Medical units"
                  value={draft?.resources.medical_units ?? 0}
                  onChange={(value) => patchResources({ medical_units: value })}
                  max={12}
                />
                <Counter
                  label="Supply vehicles"
                  value={draft?.resources.supply_vehicles ?? 0}
                  onChange={(value) => patchResources({ supply_vehicles: value })}
                  max={12}
                />
                <Counter
                  label="Survey drones"
                  value={draft?.resources.survey_drones ?? 0}
                  onChange={(value) => patchResources({ survey_drones: value })}
                  max={12}
                />
              </div>
            </section>

            <section className={styles.block} aria-labelledby="objectives-label">
              <div className={styles.blockHead}>
                <div>
                  <span className={styles.blockIndex}>05</span>
                  <h2 id="objectives-label">Objective weights</h2>
                </div>
                <span className={styles.blockMeta}>
                  <Gauge size={11} /> Σ {totalObjectiveWeight(draft ?? ({} as ScenarioConfig))}
                </span>
              </div>
              <div className={styles.rangeGrid}>
                <RangeField
                  label="Coverage"
                  value={draft?.objectives.coverage ?? 0}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(value) => patchObjectives({ coverage: value })}
                  format={(value) => value.toFixed(2)}
                />
                <RangeField
                  label="Delivery"
                  value={draft?.objectives.delivery ?? 0}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(value) => patchObjectives({ delivery: value })}
                  format={(value) => value.toFixed(2)}
                />
                <RangeField
                  label="Response time"
                  value={draft?.objectives.response_time ?? 0}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(value) => patchObjectives({ response_time: value })}
                  format={(value) => value.toFixed(2)}
                />
                <RangeField
                  label="Survey"
                  value={draft?.objectives.survey ?? 0}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(value) => patchObjectives({ survey: value })}
                  format={(value) => value.toFixed(2)}
                />
              </div>
            </section>

            <section className={styles.modeBlock} aria-labelledby="mode-label">
              <div className={styles.blockHead}>
                <div>
                  <span className={styles.blockIndex}>06</span>
                  <h2 id="mode-label">Execution mode</h2>
                </div>
              </div>
              <div className={styles.modeGrid}>
                <div className={`${styles.modeOption} ${styles.modeSelected}`}>
                  <Radio size={14} />
                  <div>
                    <strong>Rules mode</strong>
                    <p>Deterministic policy agents. Fully testable. Default.</p>
                  </div>
                  <Check size={13} />
                </div>
                <div className={styles.modeOption} title="Live model adapter is not enabled in v0.1.">
                  <LockKeyhole size={14} />
                  <div>
                    <strong>Gemini mode</strong>
                    <p>
                      {meta?.gemini_configured
                        ? 'Server key present; live adapter is not enabled in this build.'
                        : 'Optional live-model mode requires a server-side key.'}
                    </p>
                  </div>
                  <span className={styles.locked}>Gated</span>
                </div>
              </div>
            </section>
          </div>

          <aside className={styles.previewColumn} aria-label="Draft world preview">
            <div className={styles.previewHead}>
              <div>
                <span className="eyebrow">Draft preview</span>
                <h2>{world?.title ?? 'Generating world…'}</h2>
              </div>
              <span className={styles.draftTag}>Not committed</span>
            </div>

            <div className={styles.previewViewport}>
              <div
                className={styles.previewImage}
                style={{
                  backgroundImage: `linear-gradient(180deg, transparent 45%, rgba(4,10,17,0.94)), url(/brand/astergrid-hero.jpg)`,
                }}
                aria-hidden="true"
              />
              <div className={styles.previewTopo} aria-hidden="true" />
              <div className={styles.previewRings} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className={styles.previewStamp}>
                <span>WORLD BUILD</span>
                <strong>{shortHash(world?.hash)}</strong>
              </div>
              {previewState === 'loading' ? (
                <div className={styles.previewLoading}>
                  <Spinner label="Building draft world" />
                  <span>Building deterministic terrain…</span>
                </div>
              ) : null}
              {stale && previewState !== 'loading' ? (
                <div className={styles.previewStale}>Draft changed · re-generating</div>
              ) : null}
              <div className={styles.previewLegend}>
                <span>DRAFT</span>
                <span>{world?.terrain.width ?? '—'}² grid</span>
                <span>{world ? `${world.terrain.cell_size_m} m / cell` : 'awaiting preview'}</span>
              </div>
            </div>

            <div className={styles.statGrid}>
              <div>
                <span>Population</span>
                <strong>{world ? formatNumber(world.population_total) : '—'}</strong>
              </div>
              <div>
                <span>Districts</span>
                <strong>{world?.districts.length ?? '—'}</strong>
              </div>
              <div>
                <span>Demands</span>
                <strong>{world?.demands.length ?? '—'}</strong>
              </div>
              <div>
                <span>Assets</span>
                <strong>{world?.assets.length ?? '—'}</strong>
              </div>
            </div>

            <div className={styles.hashBox}>
              <span>Preview hash</span>
              <code>{world?.hash ?? '—'}</code>
              <button
                type="button"
                onClick={() => world && navigator.clipboard?.writeText(world.hash)}
                disabled={!world}
              >
                Copy
              </button>
            </div>

            <div className={styles.previewSection}>
              <div className={styles.previewSectionHead}>
                <span>Districts under load</span>
                <span>{draft?.affected_district_ids.length ?? 0} affected</span>
              </div>
              <div className={styles.miniDistricts}>
                {districts.length ? (
                  districts.map((district) => {
                    const active =
                      draft?.affected_district_ids.includes(district.id) ?? false;
                    return (
                      <div
                        key={district.id}
                        className={`${styles.miniDistrict} ${active ? styles.miniActive : ''}`}
                      >
                        <span className={styles.riskDot} />
                        <span>{district.id}</span>
                        <strong>{district.name}</strong>
                        <span>{Math.round(district.risk_base * 100)}%</span>
                      </div>
                    );
                  })
                ) : (
                  <p className={styles.awaiting}>District risk will appear after preview.</p>
                )}
              </div>
            </div>

            <div className={styles.graphExpect}>
              <div className={styles.previewSectionHead}>
                <span>Graph expectation</span>
                <span>Executed by ADK</span>
              </div>
              <div className={styles.expectRow}>
                <span>Intake</span>
                <ChevronRight size={11} />
                <span>World</span>
                <ChevronRight size={11} />
                <span className={styles.expectFan}>3 parallel branches</span>
                <ChevronRight size={11} />
                <span>Join</span>
              </div>
              <div className={styles.expectNote}>
                Preflight may request up to 2 bounded revisions. The outcome gate must pass
                before commit.
              </div>
            </div>

            {errorText ? (
              <div className={styles.errorBox} role="alert">
                <AlertTriangle size={14} />
                <div>
                  <strong>Scenario needs attention</strong>
                  <p>{errorText}</p>
                </div>
              </div>
            ) : (
              <div className={styles.readyBox}>
                <Check size={13} />
                <span>Draft is valid and the preview is hash-fresh.</span>
              </div>
            )}
          </aside>
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.backButton} onClick={closeBuilder}>
            <ArrowLeft size={13} />
            Back to overview
          </button>
          <div className={styles.footerStatus}>
            <span
              className={`${styles.footerDot} ${
                previewFresh ? styles.footerDotReady : styles.footerDotWait
              }`}
              aria-hidden="true"
            />
            {previewState === 'loading'
              ? 'Generating draft preview'
              : previewFresh
                ? 'Preview ready · hash matched'
                : stale
                  ? 'Preview stale'
                  : 'Awaiting preview'}
            {previewForText(previewFresh, stale, preview?.input_hash)}
          </div>
          <button
            type="button"
            className={styles.startButton}
            disabled={!canStart}
            onClick={() => void startRun()}
          >
            {starting ? (
              <>
                <Spinner label="Starting run" />
                Starting real workflow
              </>
            ) : (
              <>
                Start analysis
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}

function previewForText(fresh: boolean, stale: boolean, inputHash: string | undefined) {
  if (fresh) return ` · ${scenarioSignatureShort(inputHash)}`;
  if (stale) return ' · regenerate before launch';
  return '';
}

function scenarioSignatureShort(value: string | undefined): string {
  if (!value) return '';
  return shortHash(value, 8);
}
