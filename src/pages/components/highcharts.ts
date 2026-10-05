import type { Page } from '@playwright/test';

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
