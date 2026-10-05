import { expect, type Locator, type Page } from '@playwright/test';

export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

/**
 * A jQuery UI slider bound to a text input (amount / interest / tenure).
 *
 * The widget has no ARIA role, value or label, so the track is located by its stable id and the
 * handle by jQuery UI's documented class, scoped to that track. The *value* is always read from
 * the bound, labelled input (what the user sees), never from the widget's internals.
 *
 * Setting a value is real slider interaction, like a user's: drag the handle with the mouse to
 * the target's position on the track, then nudge with the arrow keys (one step per press) until
 * the bound input shows the exact target. Pixel rounding means a drag alone can land a step off.
 */
export class SliderControl {
  readonly track: Locator;
  readonly handle: Locator;

  constructor(
    private readonly page: Page,
    trackId: string,
    /** The labelled input the slider writes to. */
    readonly boundInput: Locator,
    /** Parses the input's display text, e.g. "10,00,000" -> 1000000. */
    private readonly parse: (text: string) => number,
  ) {
    this.track = page.locator(`#${trackId}`);
    this.handle = this.track.locator('.ui-slider-handle');
  }

  async setValue(target: number, range: SliderRange, expectedDisplay: string): Promise<void> {
    if (target < range.min || target > range.max) {
      throw new RangeError(`target ${target} outside slider range ${range.min}..${range.max}`);
    }
    await this.dragTo(target, range);
    await this.nudgeTo(target, range.step);
    await expect(this.boundInput).toHaveValue(expectedDisplay);
  }

  private async dragTo(target: number, { min, max }: SliderRange): Promise<void> {
    await this.handle.scrollIntoViewIfNeeded();
    const track = await this.track.boundingBox();
    const handle = await this.handle.boundingBox();
    if (!track || !handle) throw new Error('slider is not rendered');

    const y = handle.y + handle.height / 2;
    const targetX = track.x + (track.width * (target - min)) / (max - min);
    await this.page.mouse.move(handle.x + handle.width / 2, y);
    await this.page.mouse.down();
    await this.page.mouse.move(targetX, y, { steps: 15 });
    await this.page.mouse.up();
  }

  /** Closes the remaining gap with the keyboard. Bounded so a broken widget fails fast. */
  private async nudgeTo(target: number, step: number): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = this.parse(await this.boundInput.inputValue());
      const stepsAway = Math.round((target - current) / step);
      if (stepsAway === 0) return;
      await this.handle.focus();
      const key = stepsAway > 0 ? 'ArrowRight' : 'ArrowLeft';
      for (let i = 0; i < Math.abs(stepsAway); i++) await this.handle.press(key);
    }
  }
}
