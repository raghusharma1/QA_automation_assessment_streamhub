import { defineConfig, devices } from '@playwright/test';
import { cucumberReporter, defineBddProject } from 'playwright-bdd';
import { env } from './src/config/env';

const isCI = !!process.env.CI;

export default defineConfig({
  // Per-test artifacts (screenshots, traces, videos). Kept outside the HTML report folder,
  // because Playwright wipes outputDir on every run.
  outputDir: 'reports/test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: env.RETRIES ?? (isCI ? 2 : 0),
  workers: env.WORKERS ?? (isCI ? 2 : undefined),
  timeout: env.TEST_TIMEOUT_MS,
  expect: { timeout: env.EXPECT_TIMEOUT_MS },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/playwright-html', open: 'never' }],
    ['json', { outputFile: 'reports/playwright-results.json' }],
    cucumberReporter('html', {
      outputFile: 'reports/cucumber/index.html',
      externalAttachments: true,
    }),
    cucumberReporter('json', {
      outputFile: 'reports/cucumber/report.json',
      skipAttachments: false,
    }),
    cucumberReporter('junit', {
      outputFile: 'reports/cucumber/report.xml',
      suiteName: 'streamhub-qa',
    }),
  ],

  use: {
    headless: env.HEADLESS,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    testIdAttribute: 'data-testid',
  },

  projects: [
    {
      // Plain Playwright tests (no browser) for the framework's own logic, e.g. the EMI oracle.
      name: 'unit',
      testDir: 'tests/unit',
    },
    {
      // UI tests against the live EMI calculator (Section B3).
      ...defineBddProject({
        name: 'ui',
        features: 'features/ui/**/*.feature',
        steps: ['src/steps/ui/**/*.ts', 'src/fixtures/**/*.ts'],
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
