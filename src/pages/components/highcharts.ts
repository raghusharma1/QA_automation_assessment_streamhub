import { expect, type Page } from '@playwright/test';

/** One point as Highcharts holds it in memory (the data the SVG is drawn from). */
export interface ChartPoint {
  series: string;
  name: string;
  category: string | number | undefined;
  y: number;
  percentage: number | undefined;
}

/**
 * Reads the data of the Highcharts chart rendered into `containerId`. The DOM only shows rounded
 * labels (e.g. pie slices show "74.9%"), so the model is used to cross-check the visible values.
 * It never replaces them.
 */
export async function readChartPoints(page: Page, containerId: string): Promise<ChartPoint[]> {
  return page.evaluate((id) => {
    type HcPoint = {
      name?: string;
      category?: string | number;
      y?: number;
      percentage?: number;
    };
    type HcChart = { renderTo: HTMLElement; series: { name: string; points: HcPoint[] }[] };
    const hc = (window as unknown as { Highcharts?: { charts: (HcChart | undefined)[] } })
      .Highcharts;
    if (!hc) throw new Error('Highcharts is not loaded on the page');
    const chart = hc.charts.find((c) => c?.renderTo.id === id);
    if (!chart) throw new Error(`No Highcharts chart rendered into #${id}`);
    return chart.series.flatMap((s) =>
      s.points.map((p) => ({
        series: s.name,
        name: p.name ?? '',
        category: p.category,
        y: p.y ?? Number.NaN,
        percentage: p.percentage,
      })),
    );
  }, containerId);
}

/**
 * Waits until the chart's data, projected through `select`, equals `expected`.
 *
 * Highcharts redraws asynchronously after the inputs change, and every slider step triggers a
 * redraw. Anything that reads, counts, hovers or screenshots a chart must call this first,
 * otherwise it can observe the previous chart and pass for the wrong reason.
 */
export async function waitForChartData<T>(
  page: Page,
  containerId: string,
  select: (points: ChartPoint[]) => T,
  expected: T,
  message: string,
): Promise<void> {
  await expect
    .poll(async () => select(await readChartPoints(page, containerId)), { message })
    .toEqual(expected);
}

/**
 * Screenshot of the chart once its drawing animation has finished.
 *
 * The data can already be right while Highcharts is still animating: bars grow and the Balance
 * line is revealed through a widening clip for about a second after a redraw. A screenshot taken
 * then (it happened in a curated run) shows half-drawn bars. So: wait until the drawn geometry
 * (bar and slice shapes, line paths, clip widths) is identical on two reads 250 ms apart.
 */
export async function screenshotWhenDrawn(page: Page, containerId: string): Promise<Buffer> {
  let previous = '';
  await expect
    .poll(
      async () => {
        const current = await page.evaluate((id) => {
          const root = document.getElementById(id);
          if (!root) return '';
          const shapes = root.querySelectorAll(
            '.highcharts-series rect, .highcharts-series path, clipPath rect',
          );
          return [...shapes]
            .map((el) => ['x', 'y', 'width', 'height', 'd'].map((a) => el.getAttribute(a)).join())
            .join('|');
        }, containerId);
        const settled = current !== '' && current === previous;
        previous = current;
        return settled;
      },
      { message: `#${containerId} finished its drawing animation`, intervals: [250] },
    )
    .toBe(true);
  return page.locator(`#${containerId}`).screenshot();
}
