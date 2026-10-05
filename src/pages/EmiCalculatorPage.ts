import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export const LOAN_TYPES = ['Home Loan', 'Personal Loan', 'Car Loan'] as const;
export type LoanType = (typeof LOAN_TYPES)[number];

/** Narrow free text from a feature file to a LoanType, failing loudly on typos. */
export function toLoanType(value: string): LoanType {
  const match = LOAN_TYPES.find((t) => t === value.trim());
  if (!match)
    throw new Error(`Unknown loan type "${value}". Expected one of: ${LOAN_TYPES.join(', ')}`);
  return match;
}

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
