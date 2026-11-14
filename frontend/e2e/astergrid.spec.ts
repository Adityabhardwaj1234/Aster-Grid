import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

const PRESETS = [
  'Topographic',
  'Radar Sweep',
  'Night Ops',
  'Thermal',
  'Hydrology',
  'Coverage',
  'Wireframe',
  'Cinematic',
  'Minimal',
];

interface RunRecord {
  id: string;
  status: string;
  revision_count: number;
}

interface BrowserProblems {
  errors: string[];
}

function watchProblems(page: Page): BrowserProblems {
  const problems: BrowserProblems = { errors: [] };
  page.on('pageerror', (error) => problems.errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('GL Driver Message') || text.includes('WebGL')) return;
    problems.errors.push(`console: ${text}`);
  });
  return problems;
}

async function waitForCompletedRun(page: Page): Promise<RunRecord> {
  const origin = new URL(page.url()).origin;
  let completed: RunRecord | null = null;
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`${origin}/api/runs?limit=5`);
        if (!response.ok()) return 'unavailable';
        const runs = (await response.json()) as RunRecord[];
        completed =
          runs.find((run) => run.status === 'completed' || run.status === 'needs_attention') ??
          null;
        return completed?.status ?? 'pending';
      },
      { timeout: 90_000, intervals: [400, 800, 1200] },
    )
    .toMatch(/completed|needs_attention/);
  if (!completed) throw new Error('The UI started a run, but no terminal run was returned by the API.');
  return completed;
}

async function openHeaderModal(page: Page, name: 'Graph' | 'Gantt' | 'Report') {
  const header = page.locator('header').first();
  await header.getByRole('button', { name, exact: true }).click();
  return page.getByRole('dialog');
}

test.describe.serial('ASTERGRID deterministic acceptance', () => {
  let runId = '';

  test('launches, builds, runs, and commits a real deterministic workflow', async ({
    page,
  }, testInfo) => {
    const problems = watchProblems(page);

    await page.goto('/');
    await expect(page.getByText('ASTERGRID', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open scenario builder' })).toBeVisible();

    await page.getByRole('button', { name: 'Open scenario builder' }).click();
    const start = page.getByRole('button', { name: /Start analysis/i }).last();
    await expect(start).toBeVisible();
    await expect(start).toBeEnabled({ timeout: 30_000 });
    await start.click();

    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Riverbend Delta', exact: true })).toBeVisible();
    const run = await waitForCompletedRun(page);
    runId = run.id;
    expect(runId).toMatch(/^run_/);
    await expect(page.getByText(/^Completed$/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('9/9 complete').first()).toBeVisible();
    await expect(page.getByText(/objective/i).first()).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByRole('alert')).toHaveCount(0);

    const inspector = page.getByRole('region', { name: 'Evidence inspector' });
    await inspector.getByRole('tab', { name: /Events/ }).click();
    const newestEvent = inspector.locator('ol li').first();
    await newestEvent.locator('button').first().click();
    await newestEvent.getByRole('button', { name: 'Inspect' }).click();
    await inspector.getByRole('tab', { name: 'Inspect' }).click();
    await expect(inspector.getByText('Sequence', { exact: true })).toBeVisible();
    await expect(inspector.getByText('Verified bundle', { exact: true })).toBeVisible();
    await expect(inspector.getByText('Hash chain')).toBeVisible();

    await page.screenshot({
      path: testInfo.outputPath('command-desktop.png'),
      fullPage: false,
    });
    expect(problems.errors, problems.errors.join('\n')).toEqual([]);
  });

  test('exposes real agent, Gantt, and report evidence with exports', async ({ page }, testInfo) => {
    const problems = watchProblems(page);
    await page.goto(`/?run=${runId}`);
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/^Completed$/i).first()).toBeVisible();

    let dialog = await openHeaderModal(page, 'Graph');
    await expect(dialog.getByRole('heading', { name: 'Agent dependency graph' })).toBeVisible();
    await expect(dialog.getByText('9/9 agents complete')).toBeVisible();
    await expect(dialog.getByText('BOUNDED REVISION')).toBeVisible();
    await expect(dialog.getByText('Scenario Director')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('modal-agents.png') });
    await dialog.getByRole('button', { name: 'Close dialog' }).click();

    dialog = await openHeaderModal(page, 'Gantt');
    await expect(dialog.getByRole('heading', { name: 'Execution ledger' })).toBeVisible();
    await expect(dialog.getByText('Parallel branches verified')).toBeVisible();
    await expect(dialog.getByText(/Parallel overlap/i)).toBeVisible();
    await expect(dialog.getByText('Bars are derived from timestamped agent events')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('modal-gantt.png') });
    await dialog.getByRole('button', { name: 'Close dialog' }).click();

    dialog = await openHeaderModal(page, 'Report');
    await expect(dialog.getByRole('heading', { name: 'Evidence report' })).toBeVisible();
    await expect(dialog.getByText('Revision history')).toBeVisible();
    await expect(dialog.getByText('Findings ledger')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Print' })).toBeVisible();

    const jsonDownload = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'JSON', exact: true }).click();
    const json = await jsonDownload;
    expect(json.suggestedFilename()).toMatch(/^astergrid-run_.*\.json$/);
    const jsonPath = await json.path();
    expect(jsonPath).not.toBeNull();
    const exported = JSON.parse(readFileSync(jsonPath as string, 'utf8')) as {
      report: { run_id: string; findings: unknown[] };
      manifest: { run_id: string };
    };
    expect(exported.report.run_id).toBe(runId);
    expect(exported.manifest.run_id).toBe(runId);
    expect(exported.report.findings.length).toBeGreaterThan(0);

    const markdownDownload = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Markdown' }).click();
    const markdown = await markdownDownload;
    expect(markdown.suggestedFilename()).toMatch(/^astergrid-run_.*\.md$/);
    const markdownPath = await markdown.path();
    expect(markdownPath).not.toBeNull();
    expect(readFileSync(markdownPath as string, 'utf8')).toContain('Riverbend Delta Flood');

    await page.screenshot({ path: testInfo.outputPath('modal-report.png') });
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
    expect(problems.errors, problems.errors.join('\n')).toEqual([]);
  });

  test('switches all nine render presets, replays, and honours keyboard shortcuts', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const problems = watchProblems(page);
    await page.goto(`/?run=${runId}`);
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });

    for (const preset of PRESETS) {
      await page.getByTitle('Rendering presets').click();
      await page.getByRole('button', { name: new RegExp(`^${preset}`) }).click();
      await expect(page.getByText(`${preset} · balanced`, { exact: true })).toBeVisible();
      await page.waitForTimeout(250);
    }
    await expect(page.getByText('Minimal · balanced', { exact: true })).toBeVisible();

    const slider = page.getByRole('slider', { name: 'Simulation tick' });
    await expect(slider).toHaveValue('36');
    await page.getByRole('button', { name: 'Jump to start' }).click();
    await expect(slider).toHaveValue('0');
    await page.getByRole('button', { name: '2×' }).click();
    await page.getByRole('button', { name: 'Play replay' }).click();
    await expect(page.getByRole('button', { name: 'Pause replay' })).toBeVisible();
    await page.waitForTimeout(450);
    expect(Number(await slider.inputValue())).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Pause replay' }).click();
    await page.getByRole('button', { name: 'Jump to end' }).click();
    await expect(slider).toHaveValue('36');

    await page.getByRole('heading', { name: 'Riverbend Delta', exact: true }).press('Escape');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('ArrowLeft');
    await expect(slider).toHaveValue('35');
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveValue('36');

    await page.keyboard.press('g');
    await expect(page.getByRole('heading', { name: 'Agent dependency graph' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.keyboard.press('t');
    await expect(page.getByRole('heading', { name: 'Execution ledger' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.keyboard.press('r');
    await expect(page.getByRole('heading', { name: 'Evidence report' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.keyboard.press('Shift+?');
    await expect(page.getByText(/Shortcuts: Space replay/)).toBeVisible();

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByTitle('Scene quality and lighting').click();
    await expect(page.getByText('Honoured by system')).toBeVisible();
    await page.getByRole('button', { name: 'Close scene settings' }).click();
    expect(problems.errors, problems.errors.join('\n')).toEqual([]);
  });

  test('keeps tablet and mobile command layouts usable', async ({ page }, testInfo) => {
    const problems = watchProblems(page);
    await page.goto(`/?run=${runId}`);
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.getByRole('navigation', { name: 'Command center views' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('tablet-command.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: 'Riverbend Delta', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Command center views' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('mobile-scene.png') });

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);

    await page.getByRole('button', { name: 'Brief' }).click();
    const brief = page.getByRole('region', { name: 'Scenario brief and agents' });
    await expect(brief).toBeVisible();
    await expect(brief.getByText('Districts under load')).toBeVisible();
    await expect(brief.getByText('Scenario brief')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('mobile-brief.png') });

    await page.getByRole('button', { name: 'Evidence', exact: true }).click();
    const evidence = page.getByRole('region', { name: 'Response metrics and evidence' });
    await expect(evidence).toBeVisible();
    await expect(evidence.getByText('Response metrics', { exact: true })).toBeVisible();
    await expect(evidence.getByText('Evidence inspector', { exact: true })).toBeVisible();
    await expect(evidence.getByRole('tab', { name: /Findings/ })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('mobile-evidence.png') });

    await page.getByRole('button', { name: 'Agents' }).click();
    await expect(page.getByRole('heading', { name: 'Agent dependency graph' })).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog' }).click();

    await page.getByRole('button', { name: 'Scene' }).click();
    await expect(page.locator('canvas')).toBeVisible();
    expect(problems.errors, problems.errors.join('\n')).toEqual([]);
  });
});
