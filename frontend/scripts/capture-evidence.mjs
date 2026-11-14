import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const PRESETS = [
  ['Topographic', 'preset-01-topographic'],
  ['Radar Sweep', 'preset-02-radar-sweep'],
  ['Night Ops', 'preset-03-night-ops'],
  ['Thermal', 'preset-04-thermal'],
  ['Hydrology', 'preset-05-hydrology'],
  ['Coverage', 'preset-06-coverage'],
  ['Wireframe', 'preset-07-wireframe'],
  ['Cinematic', 'preset-08-cinematic'],
  ['Minimal', 'preset-09-minimal'],
];

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value) throw new Error(`Missing value for ${name}`);
  return value;
}

const baseUrl = argument('--base', process.env.ASTERGRID_EVIDENCE_BASE ?? 'http://127.0.0.1:8000');
const requestedRun = argument('--run', process.env.ASTERGRID_EVIDENCE_RUN ?? '');

async function latestCompletedRun() {
  const response = await fetch(`${baseUrl}/api/runs?limit=10`);
  if (!response.ok) throw new Error(`Could not list runs: HTTP ${response.status}`);
  const runs = await response.json();
  const run = runs.find((item) => item.status === 'completed' || item.status === 'needs_attention');
  if (!run) throw new Error('No terminal run is available to capture.');
  return run.id;
}

const runId = requestedRun || (await latestCompletedRun());
const outDir = path.join(repoRoot, 'docs', 'evidence', runId, 'screenshots');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});

const problems = [];
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (text.includes('GL Driver Message') || text.includes('WebGL')) return;
  problems.push(`console: ${text}`);
});

const shot = async (name) => {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`captured ${path.relative(repoRoot, file)}`);
};

try {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /See the whole response/i }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1_200);
  await shot('launch');

  await page.goto(`${baseUrl}/?run=${encodeURIComponent(runId)}`, { waitUntil: 'domcontentloaded' });
  await page.getByText('ASTERGRID', { exact: true }).first().waitFor({ timeout: 30_000 });
  await page.locator('canvas').waitFor({ state: 'visible', timeout: 45_000 });
  await page.getByText(/^Completed$/i).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1_200);
  await shot('desktop-command');

  for (const [preset, file] of PRESETS) {
    await page.getByTitle('Rendering presets').click();
    await page.getByRole('button', { name: new RegExp(`^${preset}`) }).click();
    await page.getByText(`${preset} · balanced`, { exact: true }).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(750);
    await shot(file);
  }

  await page.getByTitle('Rendering presets').click();
  await page.getByRole('button', { name: /^Topographic/ }).click();
  await page.waitForTimeout(500);

  const header = page.locator('header').first();
  await header.getByRole('button', { name: 'Graph', exact: true }).click();
  await page.getByRole('heading', { name: 'Agent dependency graph' }).waitFor();
  await page.waitForTimeout(350);
  await shot('modal-agents');
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await header.getByRole('button', { name: 'Gantt', exact: true }).click();
  await page.getByRole('heading', { name: 'Execution ledger' }).waitFor();
  await page.waitForTimeout(350);
  await shot('modal-gantt');
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await header.getByRole('button', { name: 'Report', exact: true }).click();
  await page.getByRole('heading', { name: 'Evidence report' }).waitFor();
  await page.waitForTimeout(350);
  await shot('modal-report');
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(800);
  await shot('tablet-command');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  await shot('mobile-scene');

  await page.getByRole('button', { name: 'Brief' }).click();
  await page.getByRole('region', { name: 'Scenario brief and agents' }).waitFor();
  await page.waitForTimeout(500);
  await shot('mobile-brief');

  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  await page.getByRole('region', { name: 'Response metrics and evidence' }).waitFor();
  await page.waitForTimeout(500);
  await shot('mobile-evidence');

  const hasCanvas = (await page.locator('canvas').count()) > 0;
  const fallbackVisible = await page.getByText('3D context unavailable').isVisible().catch(() => false);
  console.log(`run=${runId}`);
  console.log(`canvas=${hasCanvas} webglFallback=${fallbackVisible}`);
  console.log(`problems=${JSON.stringify(problems)}`);
  if (!hasCanvas) throw new Error('The 3D canvas was not available for evidence capture.');
  if (problems.length) throw new Error(`Browser problems detected:\n${problems.join('\n')}`);
} finally {
  await browser.close();
}