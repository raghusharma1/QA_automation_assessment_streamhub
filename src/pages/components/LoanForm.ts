import { expect, type Locator, type Page } from '@playwright/test';
import { formatInr } from '../../support/inr';
import type { LoanType } from '../EmiCalculatorPage';

export interface LoanFormValues {
  principal: number;
  annualRatePct: number;
  years: number;
}

/**
 * The amount / interest / tenure inputs. Each input has a real <label for>, so they are located
 * by accessible label. The amount label changes with the selected tab ("Home Loan Amount",
 * "Personal Loan Amount", ...).
 */
export class LoanForm {
  readonly interestRate: Locator;
  readonly tenure: Locator;
  /** Tenure unit radio. The site's Yr/Mo toggle has no accessible name, so a stable id is used. */
  readonly tenureInYears: Locator;

  constructor(private readonly page: Page) {
    this.interestRate = page.getByLabel('Interest Rate', { exact: true });
    this.tenure = page.getByLabel('Loan Tenure', { exact: true });
    this.tenureInYears = page.locator('#loanyears');
  }

  amount(loanType: LoanType): Locator {
    return this.page.getByLabel(`${loanType} Amount`, { exact: true });
  }

  /** Types each value the way a user would: fill, then Tab out (the site recalculates on change). */
  async enter(loanType: LoanType, values: LoanFormValues): Promise<void> {
    await expect(this.tenureInYears).toBeChecked();
    await this.setField(
      this.amount(loanType),
      String(values.principal),
      formatInr(values.principal),
    );
    await this.setField(
      this.interestRate,
      String(values.annualRatePct),
      String(values.annualRatePct),
    );
    await this.setField(this.tenure, String(values.years), String(values.years));
  }

  /**
   * Guard, not a test assertion: the action only counts as done once the site has accepted and
   * reformatted the value (e.g. 2500000 -> 25,00,000). This turns a silently rejected input into
   * an immediate, precise failure instead of a confusing EMI mismatch later.
   */
  private async setField(field: Locator, value: string, expectedDisplay: string): Promise<void> {
    await field.fill(value);
    await field.press('Tab');
    await expect(field).toHaveValue(expectedDisplay);
  }
}
