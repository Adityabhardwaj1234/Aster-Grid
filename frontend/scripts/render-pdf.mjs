/**
 * Render a local HTML document to PDF with Playwright's Chromium.
 *
 * This deliberately uses the Node entry point plus the signed Chromium build so
 * it never depends on the unsigned console-script shims in `.venv\Scripts`,
 * which Windows Application Control can block with `os error 4551`.
 *
 * Usage (from `frontend`):
 *   node scripts/render-pdf.mjs --html ..\docs\evidence\report.html --pdf ..\docs\evidence\report.pdf
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required argument: ${name}`);
  }
  const value = process.argv[index + 1];
  if (!value) throw new Error(`Missing value for ${name}`);
  return value;
}

const htmlPath = path.resolve(argument('--html'));
const pdfPath = path.resolve(
  argument('--pdf', htmlPath.replace(/\.html?$/i, '.pdf')),
);
const title = argument('--title', path.basename(pdfPath, '.pdf'));

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `
      <div style="width:100%;box-sizing:border-box;padding:0 16mm;font-family:Segoe UI,Arial,sans-serif;font-size:8px;color:#6b7280;display:flex;justify-content:space-between;">
        <span>${title}</span>
        <span class="pageNumber"></span>
      </div>`,
    margin: { top: '16mm', right: '16mm', bottom: '18mm', left: '16mm' },
  });
} finally {
  await browser.close();
}

console.log(`PDF written to ${pdfPath}`);
