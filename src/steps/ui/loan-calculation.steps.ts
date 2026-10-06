import { expect } from '@playwright/test';
import { requireLoan, Then, When } from '../../fixtures';
import { toLoanType } from '../../pages/EmiCalculatorPage';
import { calculateEmi, yearsToMonths } from '../../support/emi-math';
import { formatInr, parseAmountShorthand } from '../../support/inr';

/** Displayed amounts look like "₹33,038"; match the whole text so "₹133,038" can't pass. */
const rupees = (value: number) => new RegExp(`^\\s*₹\\s*${formatInr(value)}\\s*$`);

When('I select the {string} tab', async ({ emiPage, ctx }, tab: string) => {
  ctx.loanType = toLoanType(tab);
  await emiPage.selectLoanTab(ctx.loanType);
});

When(
  'I enter a loan amount of {word}, an interest rate of {float}% and a tenure of {int} years',
  async ({ emiPage, ctx }, amount: string, rate: number, years: number) => {
    if (!ctx.loanType) throw new Error('Select a loan tab before entering values');
    const principal = parseAmountShorthand(amount);
    await emiPage.form.enter(ctx.loanType, { principal, annualRatePct: rate, years });

    const input = { principal, annualRatePct: rate, months: yearsToMonths(years) };
    ctx.loan = { input, expected: calculateEmi(input) };
  },
);

When(
  'I use the sliders to set a loan amount of {word}, an interest rate of {float}% and a tenure of {int} years',
  async ({ emiPage, ctx, $testInfo }, amount: string, rate: number, years: number) => {
    if (!ctx.loanType) throw new Error('Select a loan tab before using the sliders');
    const principal = parseAmountShorthand(amount);
    const moves = await emiPage.setWithSliders(ctx.loanType, {
      principal,
      annualRatePct: rate,
      years,
    });
    // Evidence that the sliders were dragged: where each drag landed, before keyboard nudges.
    await $testInfo.attach('slider-moves.json', {
      body: JSON.stringify(moves, null, 2),
      contentType: 'application/json',
    });

    const input = { principal, annualRatePct: rate, months: yearsToMonths(years) };
    ctx.loan = { input, expected: calculateEmi(input) };
  },
);

Then('the displayed EMI matches my independently calculated EMI', async ({ emiPage, ctx }) => {
  const { expected } = requireLoan(ctx);
  // Web-first assertion: retries until the site has finished recalculating (recon showed a
  // stale value is visible for a moment right after the last input).
  await expect(emiPage.emi).toHaveText(rupees(expected.emi));
});

Then(
  'the displayed total interest and total payment match my calculation',
  async ({ emiPage, ctx }) => {
    const { expected } = requireLoan(ctx);
    await expect(emiPage.totalInterest).toHaveText(rupees(expected.totalInterest));
    await expect(emiPage.totalPayment).toHaveText(rupees(expected.totalPayment));
  },
);
