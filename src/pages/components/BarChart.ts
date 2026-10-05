import { expect, type Locator, type Page } from '@playwright/test';
import { parseInr } from '../../support/inr';
import { readChartPoints, waitForChartData, type ChartPoint } from './highcharts';

export type BarSeries = 'Interest' | 'Principal';

export interface BarTooltip {
  year: number;
  series: BarSeries;
  amount: number;
  totalPayment: number;
}

/**
 * The yearly payment chart (Highcharts 8.1): stacked Interest + Principal columns per calendar
 * year, plus a Balance spline. As with the pie, only the container id and Highcharts' documented
 * class names exist as hooks.
 *
 * Bars are scoped to the column series inside the plot. An unscoped `rect.highcharts-point` also
 * matches the two legend symbols (found during M3 recon), which would inflate the count.
 */
export class BarChart {
  static readonly containerId = 'emibarchart';

  readonly container: Locator;
  readonly svg: Locator;
  /** One <rect> per stacked segment: Interest and Principal for every year. */
  readonly barSegments: Locator;
  readonly yearLabels: Locator;
  readonly tooltip: Locator;

  constructor(private readonly page: Page) {
    this.container = page.locator(`#${BarChart.containerId}`);
    this.svg = this.container.locator('svg.highcharts-root');
    this.barSegments = this.container.locator(
      '.highcharts-series-group .highcharts-column-series rect.highcharts-point',
    );
    this.yearLabels = this.container.locator('.highcharts-xaxis-labels text');
    this.tooltip = this.container.locator('.highcharts-tooltip');
  }

  async modelPoints(): Promise<ChartPoint[]> {
    return readChartPoints(this.page, BarChart.containerId);
  }

  /**
   * Structure only: waits until the chart has been redrawn with exactly these calendar years.
   * Use it to know the chart has settled for the current inputs. Value correctness is checked
   * separately (`expectYearlyValues`), so a wrong value is reported as a value mismatch and not
   * as a rendering problem.
   */
  async waitForYearCategories(years: number[]): Promise<void> {
    await waitForChartData(
      this.page,
      BarChart.containerId,
      (points) => points.filter((p) => p.series === 'Interest').map((p) => Number(p.category)),
      years,
      'bar chart redrawn with one column per calendar year of the schedule',
    );
  }

  /**
   * Waits until every year's interest and principal (rounded to the rupee) equal the expected
   * values. The diff in the failure message shows exactly which year and series disagree.
   */
  async expectYearlyValues(expected: { year: number; interest: number; principal: number }[]) {
    await waitForChartData(
      this.page,
      BarChart.containerId,
      (points) => {
        const valueOf = (series: BarSeries, year: number) =>
          Math.round(
            points.find((p) => p.series === series && Number(p.category) === year)?.y ?? NaN,
          );
        const years = points.filter((p) => p.series === 'Interest').map((p) => Number(p.category));
        return years.map((year) => ({
          year,
          interest: valueOf('Interest', year),
          principal: valueOf('Principal', year),
        }));
      },
      expected,
      'yearly interest and principal in the bar chart vs. the amortization schedule',
    );
  }

  /**
   * The <rect> drawn for one year of one series. It is found through the chart data (the
   * point's own SVG element), not by a hardcoded position, so reordering or restyling the bars
   * can't make a step target the wrong one. The resolved element is returned as a normal
   * Playwright locator, so actions on it keep auto-waiting and actionability checks.
   */
  async barFor(year: number, series: BarSeries): Promise<Locator> {
    const index = await this.barSegments.evaluateAll(
      (rects, { id, year, series }) => {
        type Point = { category?: number | string; graphic?: { element: SVGElement } };
        type Chart = { renderTo: HTMLElement; series: { name: string; points: Point[] }[] };
        const hc = (window as unknown as { Highcharts: { charts: (Chart | undefined)[] } })
          .Highcharts;
        const chart = hc.charts.find((c) => c?.renderTo.id === id);
        const element = chart?.series
          .find((s) => s.name === series)
          ?.points.find((p) => Number(p.category) === year)?.graphic?.element;
        return element ? rects.indexOf(element) : -1;
      },
      { id: BarChart.containerId, year, series },
    );
    if (index < 0) throw new Error(`No ${series} bar for year ${year} in the chart`);
    return this.barSegments.nth(index);
  }

  /**
   * Hovers a bar until its tooltip shows that year. Hover is retried because Highcharts creates
   * the tooltip lazily on mouse movement: a hover delivered while the page is still settling
   * (e.g. right after a scroll) can be missed. A raw mouse.move to computed coordinates failed
   * intermittently for exactly that reason (M3 stability run).
   *
   * The bar is re-resolved on every attempt, so a redraw between attempts can't leave the retry
   * hovering whatever element now sits at a stale index. The retry only covers *delivering* the
   * hover: the tooltip must show this exact year and series, and its values are checked strictly
   * by the caller. Returns the number of attempts so callers can report retries.
   */
  async hoverBar(year: number, series: BarSeries): Promise<number> {
    let attempts = 0;
    await expect(async () => {
      attempts += 1;
      const bar = await this.barFor(year, series);
      await this.page.mouse.move(0, 0); // leave the chart so the next hover is a fresh entry
      await bar.hover();
      await expect(this.tooltip).toContainText(`Year : ${year}${series}`, { timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    return attempts;
  }

  /** Parses e.g. "Year : 2028Interest : ₹ 91,948Total Payment : ₹ 2,66,933". */
  static parseTooltip(text: string): BarTooltip {
    const match =
      /Year\s*:\s*(\d{4})\s*(Interest|Principal)\s*:\s*₹\s*([\d,]+)\s*Total Payment\s*:\s*₹\s*([\d,]+)/.exec(
        text,
      );
    if (!match) throw new Error(`Unrecognised bar tooltip: "${text}"`);
    return {
      year: Number(match[1]),
      series: match[2] as BarSeries,
      amount: parseInr(match[3]!),
      totalPayment: parseInr(match[4]!),
    };
  }
}
