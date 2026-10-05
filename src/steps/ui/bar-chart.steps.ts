import { expect } from '@playwright/test';
import { requireLoan, Then, When, type ScenarioContext } from '../../fixtures';
import { BarChart, type BarSeries } from '../../pages/components/BarChart';
import { amortizeByYear, type YearMonth } from '../../support/emi-math';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function toMonthNumber(name: string): number {
  const index = MONTHS.indexOf(name);
  if (index < 0) throw new Error(`Unknown month "${name}". Use a full English month name.`);
  return index + 1;
}

function toSeries(name: string): BarSeries {
  if (name !== 'Interest' && name !== 'Principal') {
    throw new Error(`Unknown bar series "${name}". Expected Interest or Principal.`);
  }
  return name;
}

function requireSchedule(ctx: ScenarioContext): NonNullable<ScenarioContext['schedule']> {
  if (!ctx.schedule) throw new Error('No schedule start chosen yet');
  return ctx.schedule;
}

When(
  'I change the schedule start month to {word} of next year',
  async ({ emiPage, ctx }, monthName: string) => {
    // Relative to today, so the scenario never refers to a month in the past.
    const start: YearMonth = {
      year: new Date().getFullYear() + 1,
      month: toMonthNumber(monthName),
    };
    await emiPage.scheduleStart.select(start);
    ctx.schedule = { start, years: amortizeByYear(requireLoan(ctx).input, start) };
  },
);

Then('the bar chart is visible', async ({ emiPage, ctx }) => {
  const chart = emiPage.barChart;
  await expect(chart.svg).toBeVisible();
  // Wait for the redraw for this loan and start month before anything reads the chart.
  await chart.waitForYears(
    requireSchedule(ctx).years.map((y) => ({
      year: y.year,
      interest: Math.round(y.interest),
      principal: Math.round(y.principal),
    })),
  );
});

Then(
  'the bar chart has one bar per calendar year of the schedule, {int} in total',
  async ({ emiPage, ctx, $testInfo }, expectedYears: number) => {
    const { years } = requireSchedule(ctx);
    // Sanity check on the spec itself: the Examples table and the oracle must agree.
    expect(years, 'oracle year count vs. Examples table').toHaveLength(expectedYears);

    const chart = emiPage.barChart;
    // "Bars" are stacked: each year is one column made of an Interest and a Principal segment.
    await expect(chart.yearLabels).toHaveText(years.map((y) => String(y.year)));
    await expect(chart.barSegments).toHaveCount(expectedYears * 2);

    await $testInfo.attach('bar-chart.png', {
      body: await chart.container.screenshot(),
      contentType: 'image/png',
    });
    await $testInfo.attach('bar-count.json', {
      body: JSON.stringify(
        { yearlyBars: expectedYears, stackedSegments: await chart.barSegments.count() },
        null,
        2,
      ),
      contentType: 'application/json',
    });
  },
);

When(
  'I hover over the {word} bar of the second year of the schedule',
  async ({ emiPage, ctx }, seriesName: string) => {
    const series = toSeries(seriesName);
    const year = requireSchedule(ctx).years[1]!.year;
    await emiPage.barChart.hoverBar(year, series);
    ctx.hoveredBar = { year, series };
  },
);

Then(
  "the tooltip shows that year's {word} and total payment from my amortization schedule",
  async ({ emiPage, ctx, $testInfo }, seriesName: string) => {
    const hovered = ctx.hoveredBar;
    if (!hovered) throw new Error('No bar hovered yet');
    expect(toSeries(seriesName)).toBe(hovered.series);
    const expectedYear = requireSchedule(ctx).years.find((y) => y.year === hovered.year)!;

    const chart = emiPage.barChart;
    await expect(chart.tooltip).toBeVisible();
    await expect(chart.tooltip).toContainText(`Year : ${hovered.year}`);
    const tooltipText = (await chart.tooltip.textContent()) ?? '';
    const tooltip = BarChart.parseTooltip(tooltipText);

    await $testInfo.attach('bar-tooltip.png', {
      body: await chart.container.screenshot(),
      contentType: 'image/png',
    });
    await $testInfo.attach('bar-tooltip.json', {
      body: JSON.stringify({ text: tooltipText, parsed: tooltip, expected: expectedYear }, null, 2),
      contentType: 'application/json',
    });

    expect(tooltip).toEqual({
      year: hovered.year,
      series: hovered.series,
      amount: Math.round(
        hovered.series === 'Interest' ? expectedYear.interest : expectedYear.principal,
      ),
      totalPayment: Math.round(expectedYear.totalPayment),
    });
    expect(tooltip.amount).toBeGreaterThan(0);
  },
);
