import { createBdd, test as base } from 'playwright-bdd';
import { ApiClient, IplApi, type ApiResult } from '../api-clients/ApiClient';
import { env } from '../config/env';
import { EmiCalculatorPage, type LoanType } from '../pages/EmiCalculatorPage';
import type { BarSeries } from '../pages/components/BarChart';
import type { LoanBreakdown, LoanInput, YearlyAmortization, YearMonth } from '../support/emi-math';
import { isBlockedHost } from '../support/third-party-blocklist';

/**
 * Typed per-scenario state shared between steps (replaces Cucumber's World).
 * Fields are optional because each scenario fills only what it needs; add new ones here
 * rather than casting in step files.
 */
export interface ScenarioContext {
  loanType?: LoanType;
  /** Loan entered in the UI and the independently computed expectation for it. */
  loan?: { input: LoanInput; expected: LoanBreakdown };
  /** First instalment month chosen in the schedule widget, and the oracle's yearly schedule. */
  schedule?: { start: YearMonth; years: YearlyAmortization[] };
  /** The bar a step hovered, so a later step can check its tooltip. */
  hoveredBar?: { year: number; series: BarSeries };
  /** Last API response received, for the Then steps that inspect it. */
  response?: ApiResult;
}

/** Read the loan a previous step entered, failing with a clear message if it is missing. */
export function requireLoan(ctx: ScenarioContext): NonNullable<ScenarioContext['loan']> {
  if (!ctx.loan)
    throw new Error('No loan entered yet: run the "I enter a loan amount..." step first');
  return ctx.loan;
}

/** Read the last API response, failing with a clear message if no request was sent. */
export function requireResponse(ctx: ScenarioContext): ApiResult {
  if (!ctx.response) throw new Error('No API request sent yet in this scenario');
  return ctx.response;
}

type Fixtures = {
  emiPage: EmiCalculatorPage;
  api: IplApi;
  ctx: ScenarioContext;
};

export const test = base.extend<Fixtures>({
  // Wrap the built-in page so third-party blocking applies only to scenarios that use a
  // browser. API scenarios never request `page`, so they never launch one.
  page: async ({ page }, use) => {
    if (env.BLOCK_THIRD_PARTY) {
      await page.context().route(
        (url) => isBlockedHost(url.href),
        (route) => route.abort('blockedbyclient'),
      );
    }
    await use(page);
  },
  // Uses only the `request` fixture, so API scenarios never launch a browser.
  api: async ({ request }, use, testInfo) => {
    await use(new IplApi(new ApiClient(request, testInfo)));
  },
  emiPage: async ({ page }, use) => {
    await use(new EmiCalculatorPage(page));
  },
  ctx: async ({}, use) => {
    await use({});
  },
});

export const { Given, When, Then, Before, After } = createBdd(test);
