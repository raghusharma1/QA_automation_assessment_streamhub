/**
 * Step 1 of the healer: DETECTION. Reads the Playwright JSON report of the self-healing run and
 * classifies each failure in code (no AI involved), so only genuine locator failures are ever
 * sent to a model.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

export type FailureKind =
  'strict-mode-violation' | 'element-not-found' | 'not-actionable' | 'assertion-mismatch' | 'other';

export interface Failure {
  title: string;
  message: string;
  /** Where the failing call is: the step line, e.g. `legacyPage.loanAmountInput.fill(...)`. */
  location: { file: string; line: number } | undefined;
  /** Accessibility snapshot of the page at the moment of failure (from error-context.md). */
  snapshot: string;
}

export interface Classification {
  kind: FailureKind;
  healable: boolean;
  reason: string;
}

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, ''); // eslint-disable-line no-control-regex

/**
 * Locator problems: the element is ambiguous or missing. An assertion that found its element and
 * read the wrong value is NOT a locator problem: healing it would hide a real defect.
 */
export function classify(message: string): Classification {
  const m = stripAnsi(message);
  if (/strict mode violation/.test(m)) {
    return {
      kind: 'strict-mode-violation',
      healable: true,
      reason: 'locator matched more than one element',
    };
  }
  // A timeout AFTER the locator resolved means the element exists but wasn't actionable
  // (disabled, covered by an overlay, not editable). That can be a real product bug, and a
  // "heal" pointing at some other element would mask it.
  if (/TimeoutError/.test(m) && /locator resolved to </.test(m)) {
    return {
      kind: 'not-actionable',
      healable: false,
      reason:
        'the locator found its element, but the element was not actionable (disabled, covered or not editable): not a locator problem',
    };
  }
  if (
    /element\(s\) not found/.test(m) ||
    (/TimeoutError/.test(m) && /waiting for (locator|getBy)/.test(m))
  ) {
    return {
      kind: 'element-not-found',
      healable: true,
      reason: 'locator matched no element before the timeout',
    };
  }
  if (/\n\s*Received( string)?:/.test(m) || /Expected[\s\S]*Received/.test(m)) {
    return {
      kind: 'assertion-mismatch',
      healable: false,
      reason:
        'the element was found and its value differs from the expectation: a product or test-data defect, not a locator problem',
    };
  }
  return { kind: 'other', healable: false, reason: 'not recognised as a locator failure' };
}

/**
 * The accessibility snapshot in an error-context.md file: its ```yaml block.
 *
 * Don't anchor on the "# Page snapshot" heading: Playwright 1.63 writes it for ACTION failures
 * (click/fill timeouts, strict mode) but not for failed `expect` assertions, where the yaml block
 * follows "# Error details" directly. Anchoring on the heading silently sent "(not available)" to
 * the model for 3 of the 5 broken locators in the first live run. Tested against real files.
 */
export function extractSnapshot(errorContext: string): string {
  const match = /```yaml\r?\n([\s\S]*?)\r?\n```/.exec(errorContext);
  return match?.[1]?.trim() ?? '';
}

interface ReportResult {
  status: string;
  error?: { message?: string; location?: { file: string; line: number } };
  attachments: { name: string; path?: string }[];
}
interface ReportSuite {
  specs?: { title: string; tests: { results: ReportResult[] }[] }[];
  suites?: ReportSuite[];
}

export function readFailures(reportPath: string): Failure[] {
  if (!existsSync(reportPath)) {
    throw new Error(`No report at ${reportPath}. Run \`npm run test:broken\` first.`);
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { suites: ReportSuite[] };
  const failures: Failure[] = [];
  const walk = (suite: ReportSuite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const result = test.results.at(-1);
        if (!result || result.status === 'passed' || result.status === 'skipped') continue;
        // Committed reports have the repository root replaced by "<repo>" (evidence:scrub).
        const contextPath = result.attachments
          .find((a) => a.name === 'error-context')
          ?.path?.replace(/^<repo>/, REPO_ROOT);
        // The report references the error context by absolute path, and test-results/ is not
        // committed. A missing file must stop the run: silently sending "(not available)" makes
        // the model blind, which is exactly the bug the first live run had.
        // Playwright attaches one to every failure; none at all means a different reporter setup.
        if (!contextPath || !existsSync(contextPath)) {
          throw new Error(
            `The page snapshot for "${spec.title}" is missing (${contextPath ?? 'no error-context attachment'}).\n` +
              'Run `npm run test:broken` on this machine first: the healer needs the ' +
              'error-context.md files that run writes next to its report.',
          );
        }
        failures.push({
          title: spec.title,
          message: stripAnsi(result.error?.message ?? ''),
          location: result.error?.location,
          snapshot: extractSnapshot(readFileSync(contextPath, 'utf8')),
        });
      }
    }
    suite.suites?.forEach(walk);
  };
  report.suites.forEach(walk);
  return failures;
}
