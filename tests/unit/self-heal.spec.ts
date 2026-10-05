import { expect, test } from '@playwright/test';
import {
  CandidateSchema,
  compatibleRoles,
  HealResponseSchema,
  toCode,
} from '../../self-heal/src/candidates';
import { classify, extractSnapshot } from '../../self-heal/src/failures';
import { lintSource } from '../../self-heal/src/lint-locators';
import { patchedSource } from '../../self-heal/src/patch';
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

  test('extracts the accessibility snapshot from error-context.md', () => {
    const ctx =
      '# Error details\n\n# Page snapshot\n\n```yaml\n- heading "Loan EMI" [level=4]\n```\n';
    expect(extractSnapshot(ctx)).toBe('- heading "Loan EMI" [level=4]');
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
