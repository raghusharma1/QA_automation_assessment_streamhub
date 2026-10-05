import type { Page } from '@playwright/test';

/**
 * Common base for page objects. Paths are relative to the project's `baseURL`
 * (from env/<TEST_ENV>.env), so no page object ever contains a hardcoded host.
 */
export abstract class BasePage {
  protected abstract readonly path: string;

  constructor(protected readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto(this.path);
  }
}
