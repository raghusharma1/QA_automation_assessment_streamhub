import type { Locator, Page } from '@playwright/test';
import { parsePercent } from '../../support/inr';
import { readChartPoints, type ChartPoint } from './highcharts';

/**
 * The "Break-up of Total Payment" pie chart (Highcharts 8.1, SVG).
 * Highcharts renders no ARIA roles or test ids, so the stable container id plus Highcharts' own
 * documented class names are the only hooks. They are scoped to the container, never positional.
 */
export class PieChart {
  static readonly containerId = 'emipiechart';

  readonly container: Locator;
  readonly svg: Locator;
  readonly slices: Locator;
  readonly dataLabels: Locator;
  readonly legendItems: Locator;

  constructor(private readonly page: Page) {
    this.container = page.locator(`#${PieChart.containerId}`);
    this.svg = this.container.locator('svg.highcharts-root');
    this.slices = this.container.locator('path.highcharts-point');
    this.dataLabels = this.container.locator('.highcharts-data-label text');
    this.legendItems = this.container.locator('.highcharts-legend-item');
  }

  /** Percentages printed on the slices, as the user sees them, e.g. [74.9, 25.1]. */
  async displayedPercentages(): Promise<number[]> {
    return (await this.dataLabels.allTextContents()).map(parsePercent);
  }

  /** Slice values from the chart model, e.g. [{name: 'Principal Loan Amount', y: 1000000}, ...]. */
  async modelSlices(): Promise<ChartPoint[]> {
    return readChartPoints(this.page, PieChart.containerId);
  }
}
