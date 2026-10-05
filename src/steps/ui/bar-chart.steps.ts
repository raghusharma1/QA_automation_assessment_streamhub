import { expect } from '@playwright/test';
import { requireLoan, Then, When, type ScenarioContext } from '../../fixtures';
import { BarChart, type BarSeries } from '../../pages/components/BarChart';
import { amortizeByYear, type YearMonth } from '../../support/emi-math';
import { formatInr } from '../../support/inr';

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
  // Settle on structure only (the redraw for this start month), so later steps read the right
  // chart. Values are verified by their own step, which gives a precise failure message.
  await chart.waitForYearCategories(requireSchedule(ctx).years.map((y) => y.year));
});

Then(
  'the yearly interest and principal in the bar chart match my amortization schedule',
  async ({ emiPage, ctx }) => {
    await emiPage.barChart.expectYearlyValues(
      requireSchedule(ctx).years.map((y) => ({
        year: y.year,
        interest: Math.round(y.interest),
        principal: Math.round(y.principal),
      })),
    );
  },
);

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
  async ({ emiPage, ctx, $testInfo }, seriesName: string) => {
    const series = toSeries(seriesName);
    const year = requireSchedule(ctx).years[1]!.year;
    const attempts = await emiPage.barChart.hoverBar(year, series);
    ctx.hoveredBar = { year, series };
    // Make hover retries visible in the report instead of silently absorbing them.
    if (attempts > 1) {
      $testInfo.annotations.push({
        type: 'hover-retry',
        description: `${series} ${year}: tooltip appeared after ${attempts} hover attempts`,
      });
    }
  },
);

Then(
  "the tooltip shows that year's {word} and total payment from my amortization schedule",
  async ({ emiPage, ctx, $testInfo }, seriesName: string) => {
    const hovered = ctx.hoveredBar;
    if (!hovered) throw new Error('No bar hovered yet');
    expect(toSeries(seriesName)).toBe(hovered.series);
    const expectedYear = requireSchedule(ctx).years.find((y) => y.year === hovered.year)!;

    const expectedAmount = Math.round(
      hovered.series === 'Interest' ? expectedYear.interest : expectedYear.principal,
    );
    const expectedTotal = Math.round(expectedYear.totalPayment);

    const chart = emiPage.barChart;
    // Retrying assertion on the whole tooltip, built from the oracle,
    // e.g. "Year : 2028Interest : ₹ 91,948Total Payment : ₹ 2,66,933".
    await expect(chart.tooltip).toHaveText(
      new RegExp(
        `^\\s*Year : ${hovered.year}\\s*${hovered.series} : ₹ ${formatInr(expectedAmount)}` +
          `\\s*Total Payment : ₹ ${formatInr(expectedTotal)}\\s*$`,
      ),
    );
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

    // Same check on the parsed numbers: guards against formatting-only matches.
    expect(tooltip).toEqual({
      year: hovered.year,
      series: hovered.series,
      amount: expectedAmount,
      totalPayment: expectedTotal,
    });
    expect(tooltip.amount).toBeGreaterThan(0);
  },
);
