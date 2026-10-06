import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  CandidateSchema,
  compatibleRoles,
  HealResponseSchema,
  toCode,
} from '../../self-heal/src/candidates';
import { classify, extractSnapshot, readFailures } from '../../self-heal/src/failures';
import { lintSource } from '../../self-heal/src/lint-locators';
import { chooseAdapter, promptFingerprint } from '../../self-heal/src/llm';
import { makeDiff, patchedSource } from '../../self-heal/src/patch';
import {
  assertedValues,
  exactVariant,
  groundingGate,
  stabilityGate,
} from '../../self-heal/src/validate';
import { findUsages, parseTargets, type Target } from '../../self-heal/src/targets';

// Real failure messages from `npm run test:broken` (trimmed).
const MESSAGES = {
  strict: `Error: locator.click: Error: strict mode violation: getByRole('link', { name: /Loan/ }) resolved to 13 elements:`,
  timeout: `TimeoutError: locator.fill: Timeout 5000ms exceeded.\nCall log:\n  - waiting for locator('#loan-amount')`,
  notFound: `Error: expect(locator).toHaveValue(expected) failed\n\nLocator: Interest rate input\nExpected: "9"\nTimeout: 5000ms\nError: element(s) not found`,
  valueMismatch: `Error: expect(locator).toHaveText(expected) failed\n\nLocator:  locator('#emiamount p')\nExpected: "₹33,000"\nReceived: "₹44,986"\nTimeout:  5000ms`,
};

test.describe('self-heal: detection (classify)', () => {
  test('locator failures are healable', () => {
    expect(classify(MESSAGES.strict)).toMatchObject({
      kind: 'strict-mode-violation',
      healable: true,
    });
    expect(classify(MESSAGES.timeout)).toMatchObject({ kind: 'element-not-found', healable: true });
    expect(classify(MESSAGES.notFound)).toMatchObject({
      kind: 'element-not-found',
      healable: true,
    });
  });

  test('negative control: a found element with a wrong value is NOT healable', () => {
    expect(classify(MESSAGES.valueMismatch)).toMatchObject({
      kind: 'assertion-mismatch',
      healable: false,
    });
  });

  test('ANSI colour codes do not change the classification', () => {
    expect(classify(`\u001b[31m${MESSAGES.valueMismatch}\u001b[39m`).kind).toBe(
      'assertion-mismatch',
    );
  });

  // REAL error-context.md files written by Playwright 1.63 for this project's broken suite. A
  // synthetic fixture here once hid a bug: expect failures have no "# Page snapshot" heading.
  const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

  test('extracts the snapshot from an ACTION failure (has a "# Page snapshot" heading)', () => {
    const snapshot = extractSnapshot(fixture('error-context-action-failure.md'));
    expect(snapshot).toContain('textbox "Home Loan Amount"');
    expect(snapshot).not.toContain('```');
  });

  test('extracts the snapshot from an EXPECT failure (no heading, yaml after "# Error details")', () => {
    const snapshot = extractSnapshot(fixture('error-context-expect-failure.md'));
    expect(snapshot).toContain('textbox "Interest Rate"');
    expect(snapshot).toContain('heading "Loan EMI"');
    expect(snapshot.length).toBeGreaterThan(10_000);
  });
});

test.describe('self-heal: target resolution', () => {
  const source = `
    this.loanAmountInput = page.locator('#loan-amount').describe('Home loan amount input');
    this.personalLoanTab = page
      .getByRole('link', { name: /Loan/ })
      .describe('Personal Loan product tab');`;

  test('parses multi-line locator definitions with their describe() intent', () => {
    expect(parseTargets(source, 'x.ts')).toEqual([
      {
        file: 'x.ts',
        member: 'loanAmountInput',
        expression: "page.locator('#loan-amount')",
        intent: 'Home loan amount input',
      },
      {
        file: 'x.ts',
        member: 'personalLoanTab',
        expression: "page\n      .getByRole('link', { name: /Loan/ })",
        intent: 'Personal Loan product tab',
      },
    ]);
  });

  test('finds how the steps use a locator (actions and matchers)', () => {
    const steps = `await legacyPage.loanAmountInput.fill(x);\nawait expect(legacyPage.loanAmountInput).toHaveValue(y);`;
    expect(findUsages(steps, 'loanAmountInput')).toEqual(['fill', 'toHaveValue']);
  });
});

test.describe('self-heal: structured candidates (no model-written code)', () => {
  test('builds locator code from data', () => {
    expect(
      toCode({
        strategy: 'role',
        role: 'link',
        name: 'Personal Loan',
        exact: true,
        rationale: 'r',
      }),
    ).toBe("page.getByRole('link', { name: 'Personal Loan', exact: true })");
    expect(toCode({ strategy: 'label', label: 'Interest Rate', exact: true, rationale: 'r' })).toBe(
      "page.getByLabel('Interest Rate', { exact: true })",
    );
    expect(toCode({ strategy: 'scopedId', id: 'emiamount', childTag: 'p', rationale: 'r' })).toBe(
      "page.locator('#emiamount').locator('p')",
    );
  });

  test('quotes in names are escaped, so model text cannot break out of the string', () => {
    expect(toCode({ strategy: 'text', text: "it's'); evil(", exact: false, rationale: 'r' })).toBe(
      "page.getByText('it\\'s\\'); evil(')",
    );
  });

  test('rejects anything that is not a known, well-formed strategy', () => {
    expect(
      CandidateSchema.safeParse({ strategy: 'css', selector: 'div > p', rationale: 'r' }).success,
    ).toBe(false);
    expect(
      CandidateSchema.safeParse({ strategy: 'code', code: 'page.locator("x")', rationale: 'r' })
        .success,
    ).toBe(false);
    expect(
      CandidateSchema.safeParse({ strategy: 'scopedId', id: 'a"]; evil', rationale: 'r' }).success,
      'ids are restricted to safe identifier characters',
    ).toBe(false);
    expect(
      CandidateSchema.safeParse({
        strategy: 'role',
        role: 'link',
        name: 'x',
        exact: true,
        rationale: 'r',
        extra: 1,
      }).success,
      'unknown fields are rejected',
    ).toBe(false);
    expect(HealResponseSchema.safeParse({ candidates: [] }).success, 'at least one candidate').toBe(
      false,
    );
  });

  test('stability gate rejects locators that identify an element by data', () => {
    // From the first live run: this passed every other gate and was circular.
    expect(
      stabilityGate({ strategy: 'text', text: '₹44,986', exact: false, rationale: 'r' }),
    ).toMatchObject({
      passed: false,
    });
    expect(
      stabilityGate({
        strategy: 'role',
        role: 'paragraph',
        name: '44,986',
        exact: true,
        rationale: 'r',
      }).passed,
    ).toBe(false);
    expect(
      stabilityGate({
        strategy: 'role',
        role: 'heading',
        name: 'Loan EMI',
        exact: true,
        rationale: 'r',
      }).passed,
    ).toBe(true);
    expect(
      stabilityGate({ strategy: 'scopedId', id: 'emiamount', childTag: 'p', rationale: 'r' })
        .passed,
    ).toBe(true);
  });

  test('role compatibility follows how the steps use the element', () => {
    expect(compatibleRoles(['fill', 'toHaveValue'])).toContain('textbox');
    expect(compatibleRoles(['click'])).toContain('link');
    expect(compatibleRoles(['click'])).not.toContain('textbox');
    expect(compatibleRoles(['toHaveText'])).toBe('any');
  });
});

test.describe('self-heal: patches only touch the locator expression', () => {
  const target: Target = {
    file: 'x.ts',
    member: 'loanAmountInput',
    intent: 'Home loan amount input',
    expression: "page.locator('#loan-amount')",
    usages: ['fill'],
  };

  test('replaces exactly the expression and keeps describe() and everything else', () => {
    const source =
      "this.loanAmountInput = page.locator('#loan-amount').describe('Home loan amount input');\nexpect(x).toBe(1);";
    expect(
      patchedSource(source, target, "page.getByLabel('Home Loan Amount', { exact: true })"),
    ).toBe(
      "this.loanAmountInput = page.getByLabel('Home Loan Amount', { exact: true }).describe('Home loan amount input');\nexpect(x).toBe(1);",
    );
  });

  test('refuses an ambiguous patch (expression found more than once)', () => {
    const twice = "page.locator('#loan-amount'); page.locator('#loan-amount');";
    expect(() => patchedSource(twice, target, 'x')).toThrow(/exactly once/);
  });

  test('$-patterns in model text are inserted literally, not expanded', () => {
    const source =
      "this.loanAmountInput = page.locator('#loan-amount').describe('Home loan amount input');";
    // With a replacement *string*, $` would splice in the source before the match and $& the match.
    const name = "page.getByRole('button', { name: 'a$`b$&c$'d', exact: true })";
    expect(patchedSource(source, target, name)).toBe(
      `this.loanAmountInput = ${name}.describe('Home loan amount input');`,
    );
  });
});

test.describe('self-heal: patches are standard, applicable diffs', () => {
  test('git apply accepts the generated patch and produces the patched file', () => {
    const original = [
      'export class P {',
      '  constructor(page: Page) {',
      "    this.a = page.locator('#old').describe('A');",
      "    this.b = page.getByRole('button', { name: 'B' }).describe('B');",
      '  }',
      '}',
      '',
    ].join('\n');
    const patched = original.replace(
      "page.locator('#old')",
      "page.getByLabel('A', { exact: true })",
    );
    const dir = mkdtempSync(path.join(tmpdir(), 'heal-apply-'));
    try {
      mkdirSync(path.join(dir, 'src'));
      writeFileSync(path.join(dir, 'src', 'P.ts'), original);
      writeFileSync(
        path.join(dir, 'fix.diff'),
        `${makeDiff('src/P.ts', original, patched, 'note')}\n`,
      );
      const check = spawnSync('git', ['apply', '--check', 'fix.diff'], {
        cwd: dir,
        encoding: 'utf8',
      });
      expect(check.status, check.stderr).toBe(0);
      spawnSync('git', ['apply', 'fix.diff'], { cwd: dir });
      expect(readFileSync(path.join(dir, 'src', 'P.ts'), 'utf8')).toBe(patched);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('self-heal: specificity, data and replay fingerprints', () => {
  test('a non-exact candidate has an exact variant to try; an exact one does not', () => {
    expect(
      exactVariant({ strategy: 'label', label: 'Interest rate', exact: false, rationale: 'r' }),
    ).toEqual({ strategy: 'label', label: 'Interest rate', exact: true, rationale: 'r' });
    expect(
      exactVariant({ strategy: 'label', label: 'Interest Rate', exact: true, rationale: 'r' }),
    ).toBeUndefined();
    expect(exactVariant({ strategy: 'testId', testId: 'x', rationale: 'r' })).toBeUndefined();
  });

  test('values a failure asserts or received are extracted, and echoing one is circular', () => {
    expect(assertedValues(MESSAGES.valueMismatch)).toEqual(['₹33,000', '₹44,986']);
    expect(assertedValues(MESSAGES.notFound)).toEqual([]); // "9" is too short to be meaningful
    expect(
      stabilityGate({ strategy: 'text', text: 'Paid', exact: true, rationale: 'r' }, ['Paid'])
        .passed,
    ).toBe(false);
  });

  test('grounding gate rejects candidates built from outside the evidence (e.g. model memory)', () => {
    const evidence = `- heading "Loan EMI" [level=4]\n- paragraph: ₹44,986\npage.locator('#emicalculatordashboard > div > p')`;
    // From the second live run: "my recollection of the site's markup", not in the snapshot.
    expect(
      groundingGate(
        { strategy: 'scopedId', id: 'emiamount', childTag: 'p', rationale: 'r' },
        evidence,
      ).passed,
    ).toBe(false);
    expect(
      groundingGate(
        { strategy: 'scopedId', id: 'emicalculatordashboard', rationale: 'r' },
        evidence,
      ).passed,
    ).toBe(true);
    expect(
      groundingGate(
        { strategy: 'role', role: 'heading', name: 'Loan EMI', exact: true, rationale: 'r' },
        evidence,
      ).passed,
    ).toBe(true);
    expect(
      groundingGate({ strategy: 'testId', testId: 'emi-value', rationale: 'r' }, evidence).passed,
    ).toBe(false);
  });

  test('prompt fingerprint ignores live values and refs, but not structure', () => {
    const prompt = (snapshot: string) =>
      `INTENT: x\n\nACCESSIBILITY SNAPSHOT AT FAILURE:\n\n${snapshot}`;
    const a = prompt('- textbox "Interest Rate" [ref=e12]: "9"\n- paragraph: ₹44,986');
    const sameStructure = prompt(
      '- textbox "Interest Rate" [ref=e99]: "10.5"\n- paragraph: ₹46,607',
    );
    const different = prompt('- textbox "Rate of interest" [ref=e12]: "9"\n- paragraph: ₹44,986');
    expect(promptFingerprint(a)).toBe(promptFingerprint(sameStructure));
    expect(promptFingerprint(a)).not.toBe(promptFingerprint(different));
  });
});

test.describe('self-heal: static brittle-locator lint', () => {
  const rulesFor = (code: string) => lintSource(code, 'x.ts').map((f) => f.rule);

  test('flags the brittle shapes', () => {
    expect(rulesFor(`page.locator('xpath=/html/body/div[1]/input')`)).toContain('absolute-xpath');
    expect(rulesFor(`page.locator('#a > div:nth-child(2) > p')`)).toContain('positional-css');
    expect(rulesFor(`page.locator('#a > div > div > p')`)).toContain('deep-css-chain');
    expect(rulesFor(`rows.first()`)).toContain('positional-index');
    expect(rulesFor(`page.getByRole('link', { name: /Loan/ })`)).toContain('unanchored-regex-name');
    expect(rulesFor(`page.locator('.css-1x2y3z4')`)).toContain('generated-class');
  });

  test('leaves resilient locators alone', () => {
    expect(rulesFor(`page.getByRole('link', { name: 'Personal Loan', exact: true })`)).toEqual([]);
    expect(rulesFor(`page.getByRole('heading', { level: 1, name: /^EMI Calculator\\b/ })`)).toEqual(
      [],
    );
    expect(rulesFor(`page.getByLabel('Interest Rate', { exact: true })`)).toEqual([]);
  });

  test('a justified allow comment on the previous line is honoured', () => {
    const [finding] = lintSource(
      '// locator-lint-allow: index comes from chart data\nbars.nth(i)',
      'x.ts',
    );
    expect(finding?.allowed).toBe('index comes from chart data');
  });
});

test.describe('self-heal: hardening from the pre-run review', () => {
  test('--record always asks a live model, even when a cassette exists', () => {
    // personalLoanTab has a committed cassette.
    expect(chooseAdapter('personalLoanTab', false, undefined)).toBe('replay');
    expect(chooseAdapter('personalLoanTab', true, undefined)).toBe('claude-code');
    expect(chooseAdapter('personalLoanTab', true, 'anthropic')).toBe('anthropic');
    expect(() => chooseAdapter('personalLoanTab', true, 'replay')).toThrow(/live model/);
    expect(chooseAdapter('noCassetteForThis', false, undefined)).toBe('claude-code');
  });

  test('a timeout on an element that WAS found is not a locator problem', () => {
    const resolved = (reason: string) =>
      `TimeoutError: locator.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: 'Calculate' })\n  - locator resolved to <button disabled>Calculate</button>\n  - ${reason}`;
    for (const reason of [
      'element is not enabled',
      '<div class="ad"> intercepts pointer events',
      'element is not editable',
    ]) {
      expect(classify(resolved(reason))).toMatchObject({ kind: 'not-actionable', healable: false });
    }
    // Still healable when nothing resolved.
    expect(classify(MESSAGES.timeout).kind).toBe('element-not-found');
  });

  test('a missing error-context file stops the run instead of blinding the model', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'heal-report-'));
    const report = path.join(dir, 'results.json');
    const attachment = { name: 'error-context', path: path.join(dir, 'gone', 'error-context.md') };
    const result = {
      status: 'failed',
      error: { message: MESSAGES.timeout },
      attachments: [attachment],
    };
    writeFileSync(
      report,
      JSON.stringify({
        suites: [{ specs: [{ title: 'Broken 2', tests: [{ results: [result] }] }] }],
      }),
    );
    try {
      expect(() => readFailures(report)).toThrow(/npm run test:broken/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the fingerprint sees changes in the round-2 feedback', () => {
    const base = 'INTENT: x\n\nACCESSIBILITY SNAPSHOT AT FAILURE:\n\n- paragraph: ₹44,986';
    const feedback = (code: string, reason: string) =>
      `${base}\n\nPREVIOUS CANDIDATES WERE REJECTED BY VALIDATION ON THE LIVE PAGE:\n\n- ${code}: failed "${reason}" (3 element(s) matched)`;
    expect(promptFingerprint(feedback("page.locator('#a p')", 'unique'))).not.toBe(
      promptFingerprint(feedback("page.getByText('Total')", 'grounded')),
    );
    // Snapshot values are still treated as live noise.
    expect(promptFingerprint(base)).toBe(promptFingerprint(base.replace('44,986', '33,038')));
  });

  test('a member without a parsable describe() is skipped, not merged into the next one', () => {
    for (const intent of ['"double quoted"', "'Lender\\'s rate'"]) {
      const source = `this.a = page.locator('#a').describe(${intent});\nthis.b = page.locator('#b').describe('B');`;
      const targets = parseTargets(source, 'x.ts');
      expect(targets.map((t) => t.member)).toEqual(['b']);
      expect(targets[0]?.expression).toBe("page.locator('#b')");
    }
  });

  test('candidate text with control characters is rejected', () => {
    const result = CandidateSchema.safeParse({
      strategy: 'text',
      text: 'a\nb',
      exact: true,
      rationale: 'r',
    });
    expect(result.success).toBe(false);
  });

  test('matcher states are not mistaken for asserted data', () => {
    const message =
      'Error: expect(locator).toBeVisible() failed\nExpected: visible\nReceived: hidden';
    expect(assertedValues(message)).toEqual([]);
  });
});
