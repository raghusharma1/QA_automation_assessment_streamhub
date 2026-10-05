import { expect } from '@playwright/test';
import { requireLoan, Then } from '../../fixtures';

Then('the pie chart is visible with {int} sections', async ({ emiPage }, sections: number) => {
  const pie = emiPage.pieChart;
  await expect(pie.svg).toBeVisible();
  await expect(pie.slices).toHaveCount(sections);
  await expect(pie.dataLabels).toHaveCount(sections);
  await expect(pie.legendItems).toHaveText(['Principal Loan Amount', 'Total Interest']);
});

Then(
  'both pie chart sections show numerical values greater than zero',
  async ({ emiPage, $testInfo }) => {
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

Then('the pie chart values are consistent with my calculation', async ({ emiPage, ctx }) => {
  const { input, expected } = requireLoan(ctx);
  const pie = emiPage.pieChart;

  // Slices are redrawn after the inputs change, so poll until the model reflects this loan.
  await expect
    .poll(async () => (await pie.modelSlices()).map((s) => [s.name, Math.round(s.y)]))
    .toEqual([
      ['Principal Loan Amount', input.principal],
      ['Total Interest', expected.totalInterest],
    ]);

  // The visible labels are percentages rounded to 1 decimal place.
  expect(await pie.displayedPercentages()).toEqual([
    Number(expected.principalPct.toFixed(1)),
    Number(expected.interestPct.toFixed(1)),
  ]);
});
