/**
 * Step 3: VALIDATION before anything is proposed. Every candidate must pass, in order:
 *   1. schema:    the model's output parses as a structured candidate (zod)
 *   1b. stable:   it doesn't identify the element by data (numbers in a name or text). A locator
 *                 like getByText('₹44,986') finds the EMI by the very value the test asserts:
 *                 circular, and it turns a wrong value into a "missing element". It passed every
 *                 other gate in the first live run, which is why this gate exists.
 *   2. unique:    exactly one element matches on the live page
 *   3. visible:   that element is visible
 *   4. role fits: its ARIA role fits how the steps use it (fill -> textbox, click -> link/button…)
 *   5. re-run:    the failing scenario passes 3 times in a row with the candidate patched in.
 *                 The scenario's own post-conditions are the semantic check: a candidate that
 *                 finds the WRONG element fails them.
 * The patch only ever replaces the locator expression; assertions and expected values are
 * untouched, by construction (see patch.ts).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { env } from '../../src/config/env';
import { isBlockedHost } from '../../src/support/third-party-blocklist';
import { buildLocator, compatibleRoles, type Candidate } from './candidates';
import { withPatch } from './patch';
import type { Target } from './targets';

export interface GateResult {
  gate: 'stable' | 'unique' | 'visible' | 'role' | 'rerun';
  passed: boolean;
  detail: string;
  /** The gate was deliberately not run (e.g. a higher-ranked candidate was already accepted). */
  skipped?: boolean;
}

const ROOT = path.resolve(__dirname, '..', '..');
const SELF_HEAL_CONFIG = 'playwright.self-heal.config.ts';
const RERUNS = 3;

export async function openBrowser(): Promise<Browser> {
  return chromium.launch();
}

/** Gate 1b (static): numbers are data, not identity. */
export function stabilityGate(candidate: Candidate): GateResult {
  const words = [
    'name' in candidate ? candidate.name : '',
    'text' in candidate ? candidate.text : '',
    'label' in candidate ? candidate.label : '',
    'placeholder' in candidate ? candidate.placeholder : '',
  ].join(' ');
  const data = /\d[\d,.]*/.exec(words)?.[0];
  return data
    ? {
        gate: 'stable',
        passed: false,
        detail: `identifies the element by data ("${data}"), not by what it is`,
      }
    : { gate: 'stable', passed: true, detail: 'no data-dependent text' };
}

/** Gates 1b-4: the static stability check, then the live checks on a fresh page. */
export async function checkOnLivePage(
  browser: Browser,
  candidate: Candidate,
  target: Target,
): Promise<GateResult[]> {
  const stable = stabilityGate(candidate);
  if (!stable.passed) return [stable];
  const context = await browser.newContext({ locale: 'en-IN' });
  await context.route(
    (u) => isBlockedHost(u.href),
    (r) => r.abort('blockedbyclient'),
  );
  const page = await context.newPage();
  try {
    await page.goto(env.EMI_BASE_URL);
    const locator = buildLocator(page, candidate);
    const results: GateResult[] = [stable];

    const count = await locator.count();
    results.push({ gate: 'unique', passed: count === 1, detail: `${count} element(s) matched` });
    if (count !== 1) return results;

    const visible = await locator.isVisible();
    results.push({ gate: 'visible', passed: visible, detail: visible ? 'visible' : 'hidden' });
    if (!visible) return results;

    // Playwright's own accessibility computation, e.g. `- textbox "Interest Rate": "9"`.
    const snapshot = await locator.ariaSnapshot();
    const role = /^-\s*([a-z]+)/.exec(snapshot)?.[1] ?? 'unknown';
    const allowed = compatibleRoles(target.usages);
    const fits = allowed === 'any' || allowed.includes(role);
    results.push({
      gate: 'role',
      passed: fits,
      detail: `role "${role}"; steps use: ${target.usages.join(', ')}${allowed === 'any' ? '' : `; allowed: ${allowed.join('/')}`}`,
    });
    return results;
  } finally {
    await context.close();
  }
}

function runNode(script: string, args: string[]) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 50 * 1024 * 1024,
  });
}

const PLAYWRIGHT_CLI = require.resolve('@playwright/test/cli');
const BDDGEN_CLI = path.join(
  path.dirname(require.resolve('playwright-bdd/package.json')),
  'dist',
  'cli',
  'index.js',
);

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Gate 5: patch the candidate into the page object, regenerate the BDD specs, run the failing
 * scenario RERUNS times, then restore the file (verified byte-for-byte) whatever happens.
 * Reporter is overridden to JSON-on-stdout so the run never touches the committed reports.
 */
export function rerunWithCandidate(
  target: Target,
  newExpression: string,
  scenarioTitle: string,
): GateResult {
  return withPatch(target, newExpression, () => {
    const gen = runNode(BDDGEN_CLI, ['-c', SELF_HEAL_CONFIG]);
    if (gen.status !== 0)
      return { gate: 'rerun', passed: false, detail: `bddgen failed: ${gen.stderr.slice(0, 200)}` };
    const run = runNode(PLAYWRIGHT_CLI, [
      'test',
      '-c',
      SELF_HEAL_CONFIG,
      '--grep',
      `${escapeRegex(scenarioTitle)}`,
      '--repeat-each',
      String(RERUNS),
      '--reporter',
      'json',
      '--output',
      'reports/self-healing/heal-runs',
    ]);
    try {
      const stats = (
        JSON.parse(run.stdout) as { stats: { expected: number; unexpected: number; flaky: number } }
      ).stats;
      const passed = stats.expected === RERUNS && stats.unexpected === 0 && stats.flaky === 0;
      return {
        gate: 'rerun',
        passed,
        detail: `${stats.expected}/${RERUNS} runs passed${stats.unexpected ? `, ${stats.unexpected} failed` : ''}`,
      };
    } catch {
      return {
        gate: 'rerun',
        passed: false,
        detail: `could not read the re-run result: ${run.stderr.slice(0, 200)}`,
      };
    }
  });
}
