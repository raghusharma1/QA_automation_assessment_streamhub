import { defineConfig, devices } from '@playwright/test';
import { cucumberReporter, defineBddProject } from 'playwright-bdd';
import { env } from './src/config/env';

const isCI = env.CI;
// Deterministic projects (no external site) never retry: a test that only passes on retry is a
// bug there, and a retry would hide it behind a green run. Only the live-site ui project retries.
const NO_RETRIES = { retries: 0 };

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
      ...NO_RETRIES,
    },
    {
      // SQL scenarios (Section B4) on PGlite: expected rows + mutation checks. A browser is
      // used only to render the result tables as screenshots.
      name: 'sql',
      testDir: 'tests/sql',
      ...NO_RETRIES,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1100, height: 700 } },
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
    {
      // API tests against our own IPL stats API (Section B1/B2). No browser is launched.
      ...defineBddProject({
        name: 'api',
        features: 'features/api/**/*.feature',
        steps: ['src/steps/api/**/*.ts', 'src/fixtures/**/*.ts'],
      }),
      ...NO_RETRIES,
      use: {
        // Trailing slash so relative request paths resolve under any path prefix in the URL.
        baseURL: `${env.API_BASE_URL.replace(/\/$/, '')}/`,
        extraHTTPHeaders: { Accept: 'application/json' },
      },
    },
  ],

  // Starts the API before tests and stops it afterwards. Locally, an API you already started
  // with `npm run api:dev` is reused. It starts for every run (well under a second), so nobody
  // has to remember to start it before the API tests. With API_BASE_URL set to an API that
  // runs elsewhere (e.g. a deployed one), nothing is started.
  webServer: env.API_IS_EXTERNAL
    ? undefined
    : {
        command: 'npm run api:start',
        url: `${env.API_BASE_URL.replace(/\/$/, '')}/health`,
        env: { API_PORT: String(env.API_PORT) },
        reuseExistingServer: !isCI,
        timeout: 30_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
