import { createBdd, test as base } from 'playwright-bdd';
import { env } from '../config/env';
import { EmiCalculatorPage, type LoanType } from '../pages/EmiCalculatorPage';
import { isBlockedHost } from '../support/third-party-blocklist';

/**
 * Typed per-scenario state shared between steps (replaces Cucumber's World).
 * Fields are optional because each scenario fills only what it needs; add new ones here
 * rather than casting in step files.
 */
export interface ScenarioContext {
  loanType?: LoanType;
}

type Fixtures = {
  emiPage: EmiCalculatorPage;
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
  emiPage: async ({ page }, use) => {
    await use(new EmiCalculatorPage(page));
  },
  ctx: async ({}, use) => {
    await use({});
  },
});

export const { Given, When, Then, Before, After } = createBdd(test);
