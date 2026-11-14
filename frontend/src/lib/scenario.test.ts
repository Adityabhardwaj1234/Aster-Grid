import { describe, expect, it } from 'vitest';

import type { ScenarioConfig } from '../types';
import {
  affectedDistrictsLabel,
  scenarioSignature,
  totalObjectiveWeight,
  validateScenario,
} from './scenario';

export const validScenario: ScenarioConfig = {
  name: 'Riverbend Delta Flood',
  scenario_type: 'flood',
  world_preset: 'riverbend',
  seed: 1847,
  duration_minutes: 360,
  start_hour: 6,
  disruption_level: 0.55,
  affected_district_ids: ['D-0', 'D-1', 'D-3', 'D-5'],
  weather: {
    rainfall_mm_h: 28,
    wind_kph: 24,
    wind_dir_deg: 225,
    visibility_km: 5.5,
    terrain_saturation: 0.7,
  },
  resources: {
    rescue_teams: 4,
    medical_units: 2,
    supply_vehicles: 4,
    survey_drones: 2,
  },
  objectives: {
    coverage: 0.4,
    delivery: 0.28,
    response_time: 0.22,
    survey: 0.1,
  },
  execution_mode: 'deterministic',
};

describe('scenario validation', () => {
  it('accepts the deterministic Riverbend contract', () => {
    expect(validateScenario(validScenario)).toEqual({ ok: true, errors: [] });
    expect(totalObjectiveWeight(validScenario)).toBe(1);
    expect(affectedDistrictsLabel(validScenario)).toBe('D-0 · D-1 · D-3 · D-5');
    expect(scenarioSignature(validScenario)).toBe(JSON.stringify(validScenario));
  });

  it('rejects duplicate affected districts', () => {
    const result = validateScenario({
      ...validScenario,
      affected_district_ids: ['D-0', 'D-0'],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('unique');
  });

  it('rejects empty districts and empty resources', () => {
    const noDistricts = validateScenario({
      ...validScenario,
      affected_district_ids: [],
    });
    expect(noDistricts.ok).toBe(false);

    const noResources = validateScenario({
      ...validScenario,
      resources: {
        rescue_teams: 0,
        medical_units: 0,
        supply_vehicles: 0,
        survey_drones: 0,
      },
    });
    expect(noResources.ok).toBe(false);
    expect(noResources.errors.join(' ')).toContain('At least one resource');
  });

  it('rejects boundary violations and unknown keys', () => {
    const result = validateScenario({
      ...validScenario,
      seed: -1,
      duration_minutes: 60,
      unexpected: true,
    } as ScenarioConfig);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});
