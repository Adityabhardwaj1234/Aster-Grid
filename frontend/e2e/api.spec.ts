import { expect, test } from '@playwright/test';

const scenario = {
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

test('health and meta are honest and security headers are present', async ({ request }) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({
    status: 'ok',
    database: 'ok',
  });
  expect(health.headers()['x-content-type-options']).toBe('nosniff');
  expect(health.headers()['x-frame-options']).toBe('DENY');
  expect(health.headers()['referrer-policy']).toBe('no-referrer');
  expect(health.headers()['cache-control']).toBe('no-store');
  expect(health.headers()['content-security-policy']).toContain("default-src 'self'");

  const meta = await request.get('/api/meta');
  expect(meta.status()).toBe(200);
  const body = (await meta.json()) as {
    execution_mode: string;
    max_revisions: number;
    gemini_configured: boolean;
  };
  expect(body.execution_mode).toBe('deterministic');
  expect(body.max_revisions).toBe(2);
  expect(body.gemini_configured).toBe(false);
});

test('preview rejects invalid district selections with actionable errors', async ({ request }) => {
  const empty = await request.post('/api/preview', {
    data: { ...scenario, affected_district_ids: [] },
  });
  expect(empty.status()).toBe(422);
  expect(await empty.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

  const unknown = await request.post('/api/preview', {
    data: { ...scenario, affected_district_ids: ['D-0', 'D-9'] },
  });
  expect(unknown.status()).toBe(422);
  expect(await unknown.json()).toMatchObject({ code: 'UNKNOWN_DISTRICT' });
});

test('Gemini mode is gated instead of silently falling back', async ({ request }) => {
  const response = await request.post('/api/runs?preview_world_hash=not-used', {
    data: { ...scenario, execution_mode: 'gemini' },
  });
  expect(response.status()).toBe(422);
  const body = (await response.json()) as { code: string; message: string };
  expect(body.code).toBe('GEMINI_NOT_CONFIGURED');
  expect(body.message).toContain('deterministic rules mode');
});

test('unknown runs return a precise 404', async ({ request }) => {
  const response = await request.get('/api/runs/run_does_not_exist');
  expect(response.status()).toBe(404);
  expect(await response.json()).toMatchObject({
    code: 'RUN_NOT_FOUND',
    message: expect.stringContaining('run_does_not_exist'),
  });
});
