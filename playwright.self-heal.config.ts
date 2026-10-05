/**
 * Config for the AI self-healing exercise: scenarios whose locators are deliberately broken.
 *
 * Kept separate from playwright.config.ts on purpose:
 * - `npm test` never runs these, so the main suite stays green while the broken locators stay
 *   broken (as the assessment asks);
 * - their reports go to reports/self-healing/, so a run can never overwrite the main evidence;
 * - the healer (self-heal/) reads reports/self-healing/results.json and the error-context.md
 *   files Playwright writes next to each failure.
 */
import { defineConfig, devices } from '@playwright/test';
import { defineBddProject } from 'playwright-bdd';
import { env } from './src/config/env';

export default defineConfig({
  outputDir: 'reports/self-healing/test-results',
  timeout: env.TEST_TIMEOUT_MS,
  // Short action/expect timeouts: a missing element should fail fast, not after 15s.
  expect: { timeout: 5_000 },
  retries: 0,
  workers: env.WORKERS,
  reporter: [
    ['list'],
    ['json', { outputFile: 'reports/self-healing/results.json' }],
    ['html', { outputFolder: 'reports/self-healing/html', open: 'never' }],
  ],
  use: {
    headless: env.HEADLESS,
    actionTimeout: 5_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      ...defineBddProject({
        name: 'self-healing',
        features: 'features/self-healing/**/*.feature',
        steps: ['src/steps/ui/**/*.ts', 'src/steps/self-healing/**/*.ts', 'src/fixtures/**/*.ts'],
        outputDir: '.features-gen-self-heal',
      }),
      use: {
        ...devices['Desktop Chrome'],
        baseURL: env.EMI_BASE_URL,
        locale: 'en-IN',
        timezoneId: 'Asia/Kolkata',
      },
    },
  ],
});
