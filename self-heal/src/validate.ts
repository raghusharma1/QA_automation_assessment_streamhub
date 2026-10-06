/**
 * Step 3: VALIDATION before anything is proposed. Every candidate must pass, in order:
 *   1. schema:    the model's output parses as a structured candidate (zod; checked in cli.ts)
 *   2. grounded:  every id/name/label/text appears in the evidence the model was shown
 *                 (snapshot, broken locator, failure output). Rejects remembered or invented
 *                 locators: the model once proposed '#emiamount' "from my recollection".
 *   3. stable:    it doesn't identify the element by data (numbers in a name or text). A locator
 *                 like getByText('₹44,986') finds the EMI by the very value the test asserts:
 *                 circular, and it turns a wrong value into a "missing element". It passed every
 *                 other gate in the first live run, which is why this gate exists.
 *   4. unique:    exactly one element matches on the live page
 *   5. exact preferred ("specific"): a non-exact name/label is rejected when its exact variant
 *                 is also unique; the CLI then tries the exact variant itself
 *   6. visible:   that element is visible
 *   7. role fits: its ARIA role fits how the steps use it (fill -> textbox, click -> link/button…)
 *   8. re-run:    the failing scenario passes 3 times in a row with the candidate patched in.
 *                 The scenario's own post-conditions are the semantic check: a candidate that
 *                 finds the WRONG element fails them.
 * The patch only ever replaces the locator expression; assertions and expected values are
 * untouched, by construction (see patch.ts).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { chromium, devices, type Browser } from '@playwright/test';
import { env } from '../../src/config/env';
import { isBlockedHost } from '../../src/support/third-party-blocklist';
import { buildLocator, compatibleRoles, type Candidate } from './candidates';
import { withPatch } from './patch';
import type { Target } from './targets';

export interface GateResult {
  gate: 'grounded' | 'stable' | 'unique' | 'specific' | 'visible' | 'role' | 'rerun';
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

/** The texts a candidate identifies its element by (name, text, label or placeholder). */
const identifyingText = (c: Candidate) =>
  [
    'name' in c ? c.name : '',
    'text' in c ? c.text : '',
    'label' in c ? c.label : '',
    'placeholder' in c ? c.placeholder : '',
  ]
    .filter(Boolean)
    .join(' ');

/** Values a failure asserts or received, e.g. `Expected: "9"`, `Received: "₹44,986"`. */
export function assertedValues(message: string): string[] {
  return [...message.matchAll(/^\s*(?:Expected|Received)(?: [a-z]+)?:\s*"?(.+?)"?\s*$/gm)]
    .map((m) => m[1]!.trim())
    .filter((v) => v.length > 1 && !v.startsWith('/'));
}

/**
 * Gate 1b (static): data is not identity. Two heuristic rules, deliberately fail-safe (a false
 * positive only costs a "needs a human"):
 *  - the identifying text contains a number (₹44,986, 2026…). Known false positives: real labels
 *    such as "Step 2" or "Q4". Known false negative: non-numeric data (a player's name in a cell).
 *  - the identifying text equals a value the failing step asserts or received.
 */
export function stabilityGate(candidate: Candidate, asserted: string[] = []): GateResult {
  const words = identifyingText(candidate);
  const data = /\d[\d,.]*/.exec(words)?.[0];
  if (data) {
    return {
      gate: 'stable',
      passed: false,
      detail: `identifies the element by data ("${data}"), not by what it is`,
    };
  }
  const echoed = asserted.find((v) => words.toLowerCase().includes(v.toLowerCase()));
  if (echoed) {
    return {
      gate: 'stable',
      passed: false,
      detail: `uses the value the test asserts ("${echoed}"): circular`,
    };
  }
  return { gate: 'stable', passed: true, detail: 'no data-dependent text' };
}

/**
 * Gate 1a (static): grounded in evidence. Everything a candidate identifies its element by must
 * appear in what the model was shown: the accessibility snapshot, the broken locator or the
 * failure output. The prompt asks for this; this gate ENFORCES it. In the second live run the
 * model proposed `#emiamount p` and wrote that the id was "my recollection of the site's markup
 * and is not in the snapshot": a public site it had seen in training. It happened to work, but
 * on a private app the same behaviour invents ids, so ungrounded candidates are rejected even when
 * they would pass the live checks.
 */
export function groundingGate(candidate: Candidate, evidence: string): GateResult {
  const haystack = evidence.toLowerCase();
  const needles =
    candidate.strategy === 'scopedId'
      ? [candidate.id]
      : candidate.strategy === 'testId'
        ? [candidate.testId]
        : [identifyingText(candidate)];
  const missing = needles.find((n) => !haystack.includes(n.toLowerCase()));
  return missing
    ? {
        gate: 'grounded',
        passed: false,
        detail: `"${missing}" does not appear in the snapshot, broken locator or failure output`,
      }
    : { gate: 'grounded', passed: true, detail: 'found in the evidence shown to the model' };
}

/** The same candidate with exact matching, if it has a non-exact name/label/text/placeholder. */
export function exactVariant(c: Candidate): Candidate | undefined {
  return 'exact' in c && !c.exact ? { ...c, exact: true } : undefined;
}

/**
 * Gates 1b-4: the static stability check, then the live checks on a fresh page with the same
 * device settings as the test project. Known limit: this is the page's initial state, not the
 * state at the failing step; an element that only appears after earlier steps would fail
 * "unique" here (none of the current targets do). The re-run gate covers the real flow.
 */
export async function checkOnLivePage(
  browser: Browser,
  candidate: Candidate,
  target: Target,
  asserted: string[] = [],
  evidence?: string,
): Promise<GateResult[]> {
  const grounded = evidence === undefined ? undefined : groundingGate(candidate, evidence);
  if (grounded && !grounded.passed) return [grounded];
  const stable = stabilityGate(candidate, asserted);
  if (!stable.passed) return grounded ? [grounded, stable] : [stable];
  const context = await browser.newContext({ ...devices['Desktop Chrome'], locale: 'en-IN' });
  await context.route(
    (u) => isBlockedHost(u.href),
    (r) => r.abort('blockedbyclient'),
  );
  const page = await context.newPage();
  try {
    await page.goto(env.EMI_BASE_URL);
    const locator = buildLocator(page, candidate);
    const results: GateResult[] = grounded ? [grounded, stable] : [stable];

    const count = await locator.count();
    results.push({ gate: 'unique', passed: count === 1, detail: `${count} element(s) matched` });
    if (count !== 1) return results;

    // Prefer exact matching: a case-insensitive substring match that happens to be unique today
    // breaks as soon as a similar name appears. If the exact variant is unique, it must be used
    // instead (the CLI then tries it automatically).
    const exact = exactVariant(candidate);
    if (exact) {
      const exactCount = await buildLocator(page, exact).count();
      results.push(
        exactCount === 1
          ? {
              gate: 'specific',
              passed: false,
              detail: 'not exact, but the exact variant is also unique: use that',
            }
          : {
              gate: 'specific',
              passed: true,
              detail: `exact variant matches ${exactCount}: substring needed`,
            },
      );
      if (exactCount === 1) return results;
    } else {
      results.push({ gate: 'specific', passed: true, detail: 'exact or not text-based' });
    }

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
