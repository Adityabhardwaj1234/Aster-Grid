import { z } from 'zod';

import type { ScenarioConfig, ScenarioValidation } from '../types';

const scenarioSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80),
    scenario_type: z.enum(['flood', 'wildfire', 'infrastructure', 'exploration']),
    world_preset: z.enum(['riverbend', 'cedar_ridge', 'arclight', 'meridian']),
    seed: z.number().int().min(0).max(2_147_483_647),
    duration_minutes: z.number().int().min(90).max(720),
    start_hour: z.number().int().min(0).max(23),
    disruption_level: z.number().min(0).max(1),
    affected_district_ids: z
      .array(z.string())
      .min(1, 'Select at least one affected district.')
      .max(6)
      .refine((ids) => new Set(ids).size === ids.length, 'Affected districts must be unique.'),
    weather: z.object({
      rainfall_mm_h: z.number().min(0).max(150),
      wind_kph: z.number().min(0).max(180),
      wind_dir_deg: z.number().min(0).max(360),
      visibility_km: z.number().min(0.1).max(40),
      terrain_saturation: z.number().min(0).max(1),
    }),
    resources: z
      .object({
        rescue_teams: z.number().int().min(0).max(12),
        medical_units: z.number().int().min(0).max(12),
        supply_vehicles: z.number().int().min(0).max(12),
        survey_drones: z.number().int().min(0).max(12),
      })
      .refine(
        (resources) =>
          resources.rescue_teams +
            resources.medical_units +
            resources.supply_vehicles +
            resources.survey_drones >
          0,
        'At least one resource asset is required.',
      ),
    objectives: z
      .object({
        coverage: z.number().min(0).max(1),
        delivery: z.number().min(0).max(1),
        response_time: z.number().min(0).max(1),
        survey: z.number().min(0).max(1),
      })
      .refine(
        (objectives) =>
          objectives.coverage + objectives.delivery + objectives.response_time + objectives.survey >
          0,
        'At least one objective weight must be positive.',
      ),
    execution_mode: z.enum(['deterministic', 'gemini']),
  })
  .strict();

export function validateScenario(scenario: ScenarioConfig): ScenarioValidation {
  const result = scenarioSchema.safeParse(scenario);
  if (result.success) return { ok: true, errors: [] };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.length ? `${issue.path.join('.')}: ` : '';
      return `${path}${issue.message}`;
    }),
  };
}

export function totalObjectiveWeight(scenario: ScenarioConfig): number {
  const { coverage, delivery, response_time, survey } = scenario.objectives;
  return Math.round((coverage + delivery + response_time + survey) * 100) / 100;
}

export function affectedDistrictsLabel(scenario: ScenarioConfig): string {
  return scenario.affected_district_ids.join(' · ');
}

export function scenarioSignature(scenario: ScenarioConfig): string {
  return JSON.stringify(scenario);
}
