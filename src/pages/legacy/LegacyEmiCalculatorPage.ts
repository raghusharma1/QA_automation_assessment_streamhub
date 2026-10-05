import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * ⚠️ DELIBERATELY BROKEN: input for the AI self-healing exercise (see SELF_HEALING.md).
 *
 * These locators are written the way brittle test code often is: copied from DevTools, written
 * against an older version of the page, or tied to layout instead of meaning. Each one fails
 * against the live site for a different reason. They are left broken on purpose; the healer in
 * self-heal/ proposes fixes as a report + patch and never edits this file.
 *
 * Every locator carries a `describe()` intent. Playwright prints it in error messages, and the
 * healer uses it as the "what was this supposed to find?" input for candidate validation.
 *
 * The working equivalents live in EmiCalculatorPage and its components.
 */
export class LegacyEmiCalculatorPage extends BasePage {
  protected readonly path = '/';

  /**
   * Broken #1: ambiguous accessible name (strict-mode violation). A loose regex name matches
   * every link containing "Loan": 15 elements on the live page.
   */
  readonly personalLoanTab: Locator;

  /** Broken #2: renamed id. The input's id is `loanamount`, not `loan-amount`. */
  readonly loanAmountInput: Locator;

  /** Broken #3: absolute XPath copied from DevTools; breaks when any ancestor changes. */
  readonly interestRateInput: Locator;

  /** Broken #4: positional CSS (nth-child chain) tied to the layout, not to meaning. */
  readonly monthlyEmiValue: Locator;

  /** Broken #5: text drift. The heading reads "Loan EMI", not "Monthly EMI". */
  readonly emiHeading: Locator;

  constructor(page: Page) {
    super(page);
    this.personalLoanTab = page
      .getByRole('link', { name: /Loan/ })
      .describe('Personal Loan product tab');
    this.loanAmountInput = page.locator('#loan-amount').describe('Home loan amount input');
    this.interestRateInput = page
      .locator(
        'xpath=/html/body/div[1]/div/main/article/div[2]/div[1]/div/form/div[2]/div[1]/input',
      )
      .describe('Interest rate input');
    this.monthlyEmiValue = page
      .locator('#emicalculatordashboard > div:nth-child(2) > div:nth-child(1) > p')
      .describe('Monthly EMI amount');
    this.emiHeading = page
      .getByRole('heading', { name: 'Monthly EMI' })
      .describe('Loan EMI heading');
  }
}
