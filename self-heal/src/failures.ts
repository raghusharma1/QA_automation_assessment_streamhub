/**
 * Step 1 of the healer: DETECTION. Reads the Playwright JSON report of the self-healing run and
 * classifies each failure in code (no AI involved), so only genuine locator failures are ever
 * sent to a model.
 */
import { existsSync, readFileSync } from 'node:fs';

export type FailureKind =
  'strict-mode-violation' | 'element-not-found' | 'assertion-mismatch' | 'other';

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

/** The "# Page snapshot" YAML block of an error-context.md file. */
export function extractSnapshot(errorContext: string): string {
  const match = /# Page snapshot\s*```yaml\n([\s\S]*?)```/.exec(errorContext);
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
        const contextPath = result.attachments.find((a) => a.name === 'error-context')?.path;
        failures.push({
          title: spec.title,
          message: stripAnsi(result.error?.message ?? ''),
          location: result.error?.location,
          snapshot:
            contextPath && existsSync(contextPath)
              ? extractSnapshot(readFileSync(contextPath, 'utf8'))
              : '',
        });
      }
    }
    suite.suites?.forEach(walk);
  };
  report.suites.forEach(walk);
  return failures;
}
