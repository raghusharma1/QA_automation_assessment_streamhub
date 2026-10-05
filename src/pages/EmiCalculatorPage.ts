import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { LoanForm, type LoanFormValues } from './components/LoanForm';
import { PieChart } from './components/PieChart';
import { BarChart } from './components/BarChart';
import { MonthPicker } from './components/MonthPicker';
import { SliderControl, type SliderRange } from './components/SliderControl';
import { formatInr, parseInr } from '../support/inr';

/**
 * Slider ranges per product, as observed in live recon (docs/research/06-live-recon-verified.md).
 * Used only to aim the initial drag: the keyboard nudge reads the real value from the input and
 * corrects any error, so a small change to a range on the site can't produce a wrong value.
 */
export const SLIDER_RANGES: Partial<
  Record<LoanType, { amount: SliderRange; interest: SliderRange; tenureYears: SliderRange }>
> = {
  'Home Loan': {
    amount: { min: 0, max: 20_000_000, step: 100_000 },
    interest: { min: 5, max: 20, step: 0.25 },
    tenureYears: { min: 0, max: 30, step: 0.5 },
  },
  'Personal Loan': {
    amount: { min: 0, max: 3_000_000, step: 10_000 },
    interest: { min: 5, max: 25, step: 0.25 },
    tenureYears: { min: 0, max: 5, step: 0.25 },
  },
  // Car Loan ranges were not measured, so slider input is not supported for it.
};

export const LOAN_TYPES = ['Home Loan', 'Personal Loan', 'Car Loan'] as const;
export type LoanType = (typeof LOAN_TYPES)[number];

/** Narrow free text from a feature file to a LoanType, failing loudly on typos. */
export function toLoanType(value: string): LoanType {
  const match = LOAN_TYPES.find((t) => t === value.trim());
  if (!match) {
    throw new Error(`Unknown loan type "${value}". Expected one of: ${LOAN_TYPES.join(', ')}`);
  }
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
  readonly form: LoanForm;
  readonly pieChart: PieChart;
  readonly barChart: BarChart;
  readonly scheduleStart: MonthPicker;

  /**
   * Result panel. Each figure is a <p> next to an <h4> ("Loan EMI", "Total Interest Payable",
   * "Total Payment (Principal + Interest)") with no labelled relationship between them, so the
   * semantic container ids are the stable hook.
   */
  readonly emi: Locator;
  readonly totalInterest: Locator;
  readonly totalPayment: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { level: 1, name: /^EMI Calculator\b/ });
    this.form = new LoanForm(page);
    this.pieChart = new PieChart(page);
    this.barChart = new BarChart(page);
    this.scheduleStart = new MonthPicker(page);
    this.emi = page.locator('#emiamount p');
    this.totalInterest = page.locator('#emitotalinterest p');
    this.totalPayment = page.locator('#emitotalamount p');
  }

  /**
   * Loan product tab. `exact: true` is deliberate. Accessible names match as case-insensitive
   * substrings by default, and the page has 15 links whose names contain "Loan" (e.g. "Home Loan
   * EMI Calculator with Prepayments…"). Today "Personal Loan" happens to match one of them, but
   * one recon session saw it resolve to 2 elements (not reproducible since). Exact matching keeps
   * the locator unique if the site adds a similarly named link.
   */
  loanTab(type: LoanType): Locator {
    return this.page.getByRole('link', { name: type, exact: true });
  }

  /**
   * The tab's list item. The site marks the selected product only with an `active` class on it
   * (no aria-selected), so that class is the observable "this tab is selected" state.
   */
  loanTabItem(type: LoanType): Locator {
    return this.page.getByRole('listitem').filter({ has: this.loanTab(type) });
  }

  /**
   * Sets amount, interest and tenure by interacting with the three sliders (drag + keyboard),
   * as TC2 requires, instead of typing into the inputs.
   */
  async setWithSliders(type: LoanType, values: LoanFormValues): Promise<void> {
    const ranges = SLIDER_RANGES[type];
    if (!ranges) throw new Error(`No measured slider ranges for "${type}"`);
    const { form } = this;
    const amount = new SliderControl(this.page, 'loanamountslider', form.amount(type), parseInr);
    const interest = new SliderControl(this.page, 'loaninterestslider', form.interestRate, Number);
    const tenure = new SliderControl(this.page, 'loantermslider', form.tenure, Number);

    await expect(form.tenureInYears).toBeChecked();
    await amount.setValue(values.principal, ranges.amount, formatInr(values.principal));
    await interest.setValue(values.annualRatePct, ranges.interest, String(values.annualRatePct));
    await tenure.setValue(values.years, ranges.tenureYears, String(values.years));
  }

  /**
   * Switches product. Done once the tab is marked active and the form's amount label reflects
   * the new product. Both checks matter: Home Loan is preselected on load, so the label alone
   * would not prove the navigation happened.
   */
  async selectLoanTab(type: LoanType): Promise<void> {
    await this.loanTab(type).click();
    await expect(this.loanTabItem(type)).toHaveClass(/\bactive\b/);
    await expect(this.form.amount(type)).toBeVisible();
  }
}
