import {
  Axe,
  Clock3,
  CloudRain,
  Compass,
  Crosshair,
  Droplets,
  Gauge,
  MapPin,
  ShieldAlert,
  Truck,
  Users,
  Wind,
} from 'lucide-react';

import { formatMinutes, formatNumber, titleCase } from '../../lib/format';
import { useAppStore } from '../../store/useAppStore';
import { PanelTitle } from '../Controls';
import styles from './BriefPanel.module.css';

const RESOURCE_META = [
  { key: 'rescue_teams', label: 'Rescue', icon: Users },
  { key: 'medical_units', label: 'Medical', icon: Crosshair },
  { key: 'supply_vehicles', label: 'Supply', icon: Truck },
  { key: 'survey_drones', label: 'Survey', icon: Compass },
] as const;

const OBJECTIVE_LABELS = [
  { key: 'coverage', label: 'Coverage' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'response_time', label: 'Response' },
  { key: 'survey', label: 'Survey' },
] as const;

export default function BriefPanel() {
  const run = useAppStore((state) => state.run);
  const draft = useAppStore((state) => state.draft);
  const artifacts = useAppStore((state) => state.artifacts);
  const presets = useAppStore((state) => state.presets);
  const world = useAppStore((state) =>
    state.artifacts.world
      ? state.artifacts.world
      : state.preview?.world ?? null,
  );
  const scenario = run?.scenario ?? artifacts.report?.scenario ?? artifacts.intake?.scenario ?? draft;
  const preset = presets.find((candidate) => candidate.world_preset === scenario?.world_preset);
  if (!scenario) {
    return (
      <section className={`${styles.panel} ag-panel`}>
        <PanelTitle eyebrow="Operation" title="Brief" />
        <p className={styles.loading}>Loading scenario…</p>
      </section>
    );
  }

  const affected = new Set(scenario.affected_district_ids);
  const districts = world?.districts.filter((district) => affected.has(district.id)) ?? [];
  const objectives = OBJECTIVE_LABELS.map((entry) => ({
    ...entry,
    value: scenario.objectives[entry.key],
  }));
  const objectiveTotal = objectives.reduce((sum, entry) => sum + entry.value, 0) || 1;
  const conditions = artifacts.conditions;

  return (
    <section className={`${styles.panel} ag-panel`} aria-labelledby="brief-title">
      <PanelTitle
        eyebrow="Operation / 01"
        title="Scenario brief"
        right={<span className={styles.classification}>Synthetic</span>}
      />
      <div className={styles.titleBlock}>
        <h2 id="brief-title">{scenario.name}</h2>
        <p>{preset?.description ?? 'Deterministic synthetic response scenario.'}</p>
        <div className={styles.tags}>
          <span>{titleCase(scenario.scenario_type)}</span>
          <span>{titleCase(scenario.world_preset)}</span>
          <span>{titleCase(scenario.execution_mode)}</span>
        </div>
      </div>

      <div className={styles.factGrid}>
        <div>
          <span>Seed</span>
          <strong>{scenario.seed}</strong>
        </div>
        <div>
          <span>Horizon</span>
          <strong>{formatMinutes(scenario.duration_minutes)}</strong>
        </div>
        <div>
          <span>Start</span>
          <strong>{String(scenario.start_hour).padStart(2, '0')}:00</strong>
        </div>
        <div>
          <span>Disruption</span>
          <strong>{Math.round(scenario.disruption_level * 100)}%</strong>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <span>
            <MapPin size={11} /> Districts under load
          </span>
          <span>{districts.length || scenario.affected_district_ids.length}</span>
        </div>
        <div className={styles.districtList}>
          {districts.length ? (
            districts.map((district) => (
              <div key={district.id} className={styles.districtRow}>
                <span className={styles.districtDot} aria-hidden="true" />
                <span className={styles.districtId}>{district.id}</span>
                <strong>{district.name}</strong>
                <span className={styles.districtPop}>{formatNumber(district.population)}</span>
              </div>
            ))
          ) : (
            scenario.affected_district_ids.map((id) => (
              <div key={id} className={styles.districtRow}>
                <span className={styles.districtDot} aria-hidden="true" />
                <span className={styles.districtId}>{id}</span>
                <strong>District</strong>
                <span className={styles.districtPop}>—</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <span>
            <CloudRain size={11} /> Conditions
          </span>
          <span>{conditions ? `×${conditions.travel_factor.toFixed(2)} travel` : 'Live weather'}</span>
        </div>
        <div className={styles.weatherGrid}>
          <div>
            <CloudRain size={12} />
            <span>Rain</span>
            <strong>{scenario.weather.rainfall_mm_h} <small>mm/h</small></strong>
          </div>
          <div>
            <Wind size={12} />
            <span>Wind</span>
            <strong>{scenario.weather.wind_kph} <small>kph</small></strong>
          </div>
          <div>
            <Droplets size={12} />
            <span>Saturation</span>
            <strong>{Math.round(scenario.weather.terrain_saturation * 100)}<small>%</small></strong>
          </div>
          <div>
            <Gauge size={12} />
            <span>Visibility</span>
            <strong>{scenario.weather.visibility_km.toFixed(1)} <small>km</small></strong>
          </div>
        </div>
        {world ? (
          <div className={styles.hazardNote}>
            <ShieldAlert size={12} />
            <span>{world.hazard.notes}</span>
          </div>
        ) : null}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <span>
            <Users size={11} /> Resource posture
          </span>
          <span>Synthetic</span>
        </div>
        <div className={styles.resourceGrid}>
          {RESOURCE_META.map((entry) => {
            const Icon = entry.icon;
            return (
              <div key={entry.key}>
                <Icon size={12} />
                <span>{entry.label}</span>
                <strong>{scenario.resources[entry.key]}</strong>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <span>
            <Crosshair size={11} /> Objective weights
          </span>
          <span>{Math.round(objectiveTotal * 100)}%</span>
        </div>
        <div className={styles.objectives}>
          {objectives.map((objective) => (
            <div key={objective.key} className={styles.objectiveRow}>
              <span>{objective.label}</span>
              <div className={styles.objectiveTrack}>
                <span style={{ width: `${(objective.value / objectiveTotal) * 100}%` }} />
              </div>
              <strong>{Math.round(objective.value * 100)}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.footer}>
        <span>
          <Clock3 size={10} />
          Clock starts {String(scenario.start_hour).padStart(2, '0')}:00
        </span>
        <span>
          <Axe size={10} />
          Rules mode
        </span>
      </div>
    </section>
  );
}
