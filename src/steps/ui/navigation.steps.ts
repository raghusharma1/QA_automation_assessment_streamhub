import { expect } from '@playwright/test';
import type { DataTable } from 'playwright-bdd';
import { Given, Then } from '../../fixtures';
import type { LoanType } from '../../pages/EmiCalculatorPage';

Given('I open the EMI calculator', async ({ emiPage }) => {
  await emiPage.open();
});

Then('the EMI calculator dashboard is displayed', async ({ emiPage }) => {
  await expect(emiPage.heading).toBeVisible();
});

Then('the following loan products are available:', async ({ emiPage }, products: DataTable) => {
  for (const [product] of products.raw()) {
    await expect(emiPage.loanTab(product as LoanType)).toBeVisible();
  }
});
