/**
 * Copies the UI chart screenshots attached by the last `npm test` run into docs/evidence/ under
 * stable names, so the README can show them inline (GitHub doesn't render the HTML reports).
 *
 *   npm test && npm run evidence:images
 *
 * Reads reports/playwright-results.json (written by the configured JSON reporter). Fails if an
 * expected screenshot is missing, so a stale or partial run can't silently leave old images.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface Attachment {
  name: string;
  contentType: string;
  body?: string;
  path?: string;
}
interface Suite {
  suites?: Suite[];
  specs?: {
    title: string;
    tests: { projectName: string; results: { status: string; attachments: Attachment[] }[] }[];
  }[];
}

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'evidence');

/** scenario title (prefix) + attachment name -> file in docs/evidence/ */
const WANTED = [
  { scenario: 'Scenario A', attachment: 'pie-chart.png', file: 'tc1-pie-chart-25L.png' },
  { scenario: 'Scenario B', attachment: 'pie-chart.png', file: 'tc1-pie-chart-50L.png' },
  {
    scenario: 'Schedule starting in January',
    attachment: 'bar-chart.png',
    file: 'tc2-bar-chart-january.png',
  },
  {
    scenario: 'Schedule starting in January',
    attachment: 'bar-tooltip.png',
    file: 'tc2-bar-tooltip-january.png',
  },
  {
    scenario: 'Schedule starting in June',
    attachment: 'bar-chart.png',
    file: 'tc2-bar-chart-june.png',
  },
  {
    scenario: 'Schedule starting in June',
    attachment: 'bar-tooltip.png',
    file: 'tc2-bar-tooltip-june.png',
  },
];

function collect(suite: Suite, out: { title: string; attachment: Attachment }[]) {
  suite.suites?.forEach((s) => collect(s, out));
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      if (test.projectName !== 'ui') continue;
      // The last result is the one that counts (after any retries).
      const result = test.results.at(-1);
      if (result?.status !== 'passed') continue;
      for (const attachment of result.attachments) out.push({ title: spec.title, attachment });
    }
  }
}

const report = JSON.parse(
  readFileSync(path.join(ROOT, 'reports', 'playwright-results.json'), 'utf8'),
) as Suite;
const found: { title: string; attachment: Attachment }[] = [];
collect(report, found);

mkdirSync(OUT, { recursive: true });
const missing: string[] = [];
for (const want of WANTED) {
  const hit = found.find(
    (f) => f.title.startsWith(want.scenario) && f.attachment.name === want.attachment,
  )?.attachment;
  const bytes = hit?.body
    ? Buffer.from(hit.body, 'base64')
    : hit?.path
      ? readFileSync(hit.path)
      : undefined;
  if (!bytes) {
    missing.push(`${want.scenario} / ${want.attachment}`);
    continue;
  }
  writeFileSync(path.join(OUT, want.file), bytes);
  console.log(`docs/evidence/${want.file}`);
}
if (missing.length > 0) {
  console.error(`Missing from a passing ui result: ${missing.join(', ')}`);
  process.exitCode = 1;
}
