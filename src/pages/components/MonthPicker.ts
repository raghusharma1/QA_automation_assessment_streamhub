import { expect, type Locator, type Page } from '@playwright/test';
import type { YearMonth } from '../../support/emi-math';

export const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function formatMonthYear({ year, month }: YearMonth): string {
  return `${MONTH_ABBREVIATIONS[month - 1]} ${year}`;
}

/**
 * "Schedule showing EMI payments starting from": a read-only input that opens a
 * bootstrap-datepicker in month view. The input is found by its label. The dropdown is appended
 * to <body> and has no ARIA role, so it is found by the library's documented class, and every
 * control inside it is located by role or visible text, scoped to the open month view.
 */
export class MonthPicker {
  readonly input: Locator;
  readonly monthView: Locator;

  constructor(page: Page) {
    this.input = page.getByLabel('Schedule showing EMI payments starting from', { exact: true });
    this.monthView = page.locator('.datepicker-dropdown .datepicker-months');
  }

  async select(target: YearMonth): Promise<void> {
    await this.input.click();
    await expect(this.monthView).toBeVisible();

    const yearSwitch = this.monthView.getByRole('columnheader', { name: /^\d{4}$/ });
    const next = this.monthView.getByRole('columnheader', { name: '»', exact: true });
    const previous = this.monthView.getByRole('columnheader', { name: '«', exact: true });

    for (let guard = 0; guard < 20; guard++) {
      const shown = Number(await yearSwitch.textContent());
      if (shown === target.year) break;
      await (shown < target.year ? next : previous).click();
      await expect(yearSwitch).not.toHaveText(String(shown));
    }
    await expect(yearSwitch).toHaveText(String(target.year));

    await this.monthView.getByText(MONTH_ABBREVIATIONS[target.month - 1]!, { exact: true }).click();
    await expect(this.input).toHaveValue(formatMonthYear(target));
    await expect(this.monthView).toBeHidden();
  }
}
