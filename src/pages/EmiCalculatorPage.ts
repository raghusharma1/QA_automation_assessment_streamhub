import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export type LoanType = 'Home Loan' | 'Personal Loan' | 'Car Loan';

/**
 * https://emicalculator.net/ (single page; loan tabs switch in place without changing the URL).
 *
 * Locator policy (most to least preferred): role + accessible name -> label -> text ->
 * stable semantic id. A CSS id is used only where the site exposes no accessible hook,
 * and every such use is commented.
 */
export class EmiCalculatorPage extends BasePage {
  protected readonly path = '/';

  readonly heading: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { level: 1, name: /EMI Calculator/ });
  }

  /**
   * Loan product tab. `exact: true` matters: without it, the 'Personal Loan' role query matches
   * 2 elements (substring match on accessible names) and fails Playwright's strict mode.
   */
  loanTab(type: LoanType): Locator {
    return this.page.getByRole('link', { name: type, exact: true });
  }
}
