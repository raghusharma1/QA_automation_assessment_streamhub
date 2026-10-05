import { expect } from '@playwright/test';
import { Then, When } from '../../fixtures';
import { toLoanType } from '../../pages/EmiCalculatorPage';
import { calculateEmi, yearsToMonths } from '../../support/emi-math';
import { formatInr, parseAmountShorthand } from '../../support/inr';

// Steps for the self-healing exercise. They act on the deliberately broken legacy locators;
// the assertions use the working page object where possible, so a wrong heal can't pass.

When('I switch product using the legacy Personal Loan tab locator', async ({ legacyPage }) => {
  await legacyPage.personalLoanTab.click();
});

Then('the {string} tab is the active product', async ({ emiPage }, tab: string) => {
  await expect(emiPage.loanTabItem(toLoanType(tab))).toHaveClass(/\bactive\b/);
});

When(
  'I type {word} into the legacy loan amount locator',
  async ({ legacyPage }, amount: string) => {
    await legacyPage.loanAmountInput.fill(String(parseAmountShorthand(amount)));
    await legacyPage.loanAmountInput.press('Tab');
  },
);

Then(
  'the legacy loan amount locator shows {string}',
  async ({ legacyPage, emiPage }, shown: string) => {
    await expect(legacyPage.loanAmountInput).toHaveValue(shown);
    // ...and it really is the loan amount field, not some other input that accepted the text.
    await expect(emiPage.form.amount('Home Loan')).toHaveValue(shown);
  },
);

Then(
  'the legacy interest rate locator shows the default rate {string}',
  async ({ legacyPage, emiPage }, rate: string) => {
    await expect(legacyPage.interestRateInput).toHaveValue(rate);
    await expect(emiPage.form.interestRate).toHaveValue(rate);
  },
);

Then(
  'the legacy monthly EMI locator shows the EMI for the default 50L loan at 9% for 20 years',
  async ({ legacyPage }) => {
    const { emi } = calculateEmi({
      principal: 5_000_000,
      annualRatePct: 9,
      months: yearsToMonths(20),
    });
    await expect(legacyPage.monthlyEmiValue).toHaveText(
      new RegExp(`^\\s*₹\\s*${formatInr(emi)}\\s*$`),
    );
  },
);

Then('the legacy EMI heading locator is visible and names the loan EMI', async ({ legacyPage }) => {
  await expect(legacyPage.emiHeading).toBeVisible();
  await expect(legacyPage.emiHeading).toHaveText(/\bEMI\b/);
});

Then('the monthly EMI shows {string} for the default loan', async ({ emiPage }, shown: string) => {
  await expect(emiPage.emi).toHaveText(shown);
});
