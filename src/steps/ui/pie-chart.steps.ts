import { expect } from '@playwright/test';
import { requireLoan, Then, type ScenarioContext } from '../../fixtures';
import type { EmiCalculatorPage } from '../../pages/EmiCalculatorPage';

/** Blocks until the pie has been redrawn for the loan this scenario entered. */
async function waitForPieOfEnteredLoan(emiPage: EmiCalculatorPage, ctx: ScenarioContext) {
  const { input, expected } = requireLoan(ctx);
  await emiPage.pieChart.waitForSlices([
    ['Principal Loan Amount', input.principal],
    ['Total Interest', expected.totalInterest],
  ]);
}

Then('the pie chart is visible with {int} sections', async ({ emiPage, ctx }, sections: number) => {
  // Wait for the pie of THIS loan first: the default chart also has 2 visible slices.
  await waitForPieOfEnteredLoan(emiPage, ctx);
  const pie = emiPage.pieChart;
  await expect(pie.svg).toBeVisible();
  await expect(pie.slices).toHaveCount(sections);
  await expect(pie.dataLabels).toHaveCount(sections);
  await expect(pie.legendItems).toHaveText(['Principal Loan Amount', 'Total Interest']);
});

Then(
  'the pie chart sections match my calculated principal and interest',
  async ({ emiPage, ctx }) => {
    await waitForPieOfEnteredLoan(emiPage, ctx);
    // The visible labels are the shares of total payment, rounded to 1 decimal place.
    const { expected } = requireLoan(ctx);
    await expect(emiPage.pieChart.dataLabels).toHaveText([
      `${expected.principalPct.toFixed(1)}%`,
      `${expected.interestPct.toFixed(1)}%`,
    ]);
  },
);

Then(
  'both pie chart sections show numerical values greater than zero',
  async ({ emiPage, ctx, $testInfo }) => {
    // Extract only after the redraw, so the values and screenshot belong to this loan and not
    // the page's default one (which would also be > 0 and pass for the wrong reason).
    await waitForPieOfEnteredLoan(emiPage, ctx);
    const pie = emiPage.pieChart;
    const displayed = await pie.displayedPercentages();
    const model = await pie.modelSlices();

    await $testInfo.attach('pie-chart-values.json', {
      body: JSON.stringify({ displayedPercentages: displayed, modelSlices: model }, null, 2),
      contentType: 'application/json',
    });
    await $testInfo.attach('pie-chart.png', {
      body: await pie.container.screenshot(),
      contentType: 'image/png',
    });

    expect(displayed, 'percent labels on the two slices').toHaveLength(2);
    expect(model, 'slices in the chart model').toHaveLength(2);
    for (const pct of displayed) expect(pct, 'displayed slice percentage').toBeGreaterThan(0);
    for (const slice of model) expect(slice.y, `model value of "${slice.name}"`).toBeGreaterThan(0);
  },
);
