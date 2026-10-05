# 01 - Framework research: Playwright + Cucumber (BDD) in Node.js / TypeScript

Research date: **2026-10-05**. Versions below were verified the same day with `npm view <pkg> version time --json`, the GitHub API and the official docs (raw Markdown in the upstream repos). Re-check with `npm view` before pinning if much time has passed.

---

## 0. TL;DR decision

**Use `playwright-bdd` (vitalets) on top of `@playwright/test`.** Write `.feature` files in standard Gherkin, step definitions with Cucumber Expressions, and Page Objects injected as **Playwright fixtures**. Emit **both** the Playwright HTML report and the **official Cucumber HTML + JSON reports** (produced by `@cucumber/html-formatter`, through playwright-bdd's `cucumberReporter`).

Why, in one paragraph: the brief asks for Node.js + Playwright + Cucumber. playwright-bdd is built on the official Cucumber packages (`@cucumber/gherkin`, `@cucumber/cucumber-expressions`, `@cucumber/tag-expressions`, `@cucumber/messages`, `@cucumber/html-formatter`, `@cucumber/junit-xml-formatter`), and it writes real Cucumber reports. On top of that, the tests run in the Playwright Test runner, so you get fixtures, auto-waiting `expect`, the trace viewer, retries, parallel workers, projects (UI vs API), sharding, UI mode and the VS Code extension. With `@cucumber/cucumber` + the Playwright *library* you would have to rebuild each of these by hand (browser lifecycle in World/hooks, tracing, screenshot attach, `expect` from `@playwright/test` outside its runner, and so on).

To cover the literal "Cucumber" wording for the assessor, the README should state the following. The framework uses Cucumber's Gherkin parser, Cucumber Expressions and Cucumber tag expressions, and it outputs Cucumber HTML/JSON/JUnit reports. The test runner is Playwright Test, via playwright-bdd. If you want an explicit dependency on `@cucumber/cucumber`, you can add it as a devDependency for a custom formatter, but you don't need it.

---

## 1. Runner comparison (as of Oct 2026)

### Verified versions and activity

| Package | Latest | Released | Notes |
|---|---|---|---|
| `@playwright/test` | **1.63.0** | (1.64 alphas daily as of 2026-10-05) | engines node >=20 |
| `playwright-bdd` | **9.2.1** | 2026-09-06 | peer `@playwright/test >=1.44` (docs say 1.53+); node >=20; 9.3.0-next.1 on `next` |
| `@cucumber/cucumber` | **13.3.0** | 2026-10-05 | engines node `22 \|\| 24 \|\| >=26` |
| `typescript` | 7.0.2 (latest), **6.0.3** recommended | | see gotcha: typescript-eslint peer is `>=4.8.4 <6.1.0` |
| `typescript-eslint` | 8.71.0 | | |
| `eslint` | 10.12.0 | | |
| `@eslint/js` | 10.0.1 | | |
| `eslint-plugin-playwright` | 2.12.1 | | |
| `eslint-config-prettier` | 10.1.8 | | |
| `prettier` | 3.9.9 | | `prettier-plugin-gherkin` ^4 used by the official example |
| `dotenv` | 18.0.5 | 2026-09-30 | logs an "injected env" line unless `quiet: true` |
| `zod` | 4.6.5 | | v4 API: `z.url()`, `z.enum()`, `z.coerce.number()` |
| `cross-env` | 10.1.0 | | |
| `multiple-cucumber-html-reporter` | 4.4.2 | | optional, consumes Cucumber JSON |
| `@types/node` | 26.6.4 | | match your Node major instead (e.g. `@types/node@22`) |

Repo activity (GitHub API, 2026-10-05):
- vitalets/playwright-bdd: 793 stars, 36 open issues, last push 2026-09-30, releases v9.0.0 (Jun 2026), 9.1.0, 9.2.0, 9.2.1 (Sep 2026). About 843k npm downloads per week.
- cucumber/cucumber-js: 5.4k stars, 40 open issues, pushed today. About 2.27M downloads per week (much of that is legacy and non-Playwright usage).
- microsoft/playwright: 97k stars, very active.

GitHub Actions latest tags: `actions/checkout@v7.0.1`, `actions/setup-node@v7.0.0`, `actions/upload-artifact@v7.0.1`, `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`. The official Playwright `ci-intro.md` sample still shows checkout@v6, setup-node@v6 and upload-artifact@v4. Either works; prefer current majors.

### Feature comparison

| Capability | playwright-bdd + @playwright/test | @cucumber/cucumber + playwright (library) |
|---|---|---|
| Gherkin `.feature` files, Cucumber Expressions | Yes (official @cucumber/gherkin 39, cucumber-expressions 19) | Yes (native) |
| Runner | Playwright Test (features compiled to `.features-gen/*.spec.js` by `bddgen`) | cucumber-js |
| Playwright fixtures (`page`, `request`, `context`, custom POM fixtures, worker fixtures) | Native: steps receive fixtures `({ page, homePage }, arg) => …` | None. You manage browser/context/page in a custom World plus Before/After hooks |
| Web-first `expect` with auto-retry | Native | You can import `expect` from `@playwright/test`, but it runs outside its runner (no soft-assert integration, no reporter integration) |
| Trace viewer | `use.trace` config, auto-attached to both reports | Manual `context.tracing.start/stop` and attach in hooks |
| Screenshots/video on failure | `use.screenshot: 'only-on-failure'`, auto-attached to Playwright and Cucumber reports | Manual `this.attach(await page.screenshot(), 'image/png')` in an After hook |
| Playwright HTML report | Yes | No |
| Cucumber HTML / JSON / JUnit / message reports | Yes, via `cucumberReporter('html'\|'json'\|'junit'\|'message'\|custom)` | Yes (native formatters) |
| Parallelism | Playwright workers (process per worker), `fullyParallel`, `@mode:parallel` tag | `--parallel N` |
| Retries | `retries` config, `@retries:N` tag | `--retry N`, `--retry-tag-filter` |
| Tag filtering | Cucumber tag expressions at generation (`bddgen --tags` / `tags` option), plus `--grep @tag` at run time | `--tags` (tag expressions) |
| Special tags | `@only`, `@skip`/`@fixme`, `@fail`, `@slow`, `@timeout:N`, `@retries:N`, `@mode:serial\|parallel` | none built in (implement in hooks) |
| Projects (UI vs API, multi-browser) | Native Playwright projects; `defineBddProject()` | Profiles in `cucumber.js`; no notion of projects |
| UI mode, VS Code extension, `--debug`, codegen | Yes | No |
| Sharding plus merged reports | Yes (`merge-reports` also merges Cucumber reports) | `--shard` |
| TypeScript | Transpiled by Playwright, zero config | Needs a loader (`tsx`) via `requireModule`/`import` |
| Hooks | `BeforeAll/BeforeWorker`, `Before/BeforeScenario`, `BeforeStep/AfterStep`, `After/AfterScenario` with tag filters; prefer fixtures | `BeforeAll`, `Before`, `BeforeStep`, `AfterStep`, `After`, `AfterAll` |
| World | None. Use a `ctx` fixture (playwright-bdd also has a cucumber-style mode with `this` World) | `World` / `setWorldConstructor` |

### How assessors perceive them

- Reviewers in 2025-2026 commonly see playwright-bdd as the modern idiomatic choice for "Playwright + Cucumber". It is listed in the Playwright community showcase and is the de facto BDD layer for Playwright Test. Reviewers usually like the fact that it keeps the Playwright HTML report and traces.
- Some reviewers read "Cucumber" literally and expect `@cucumber/cucumber` and a `cucumber.js` config. Mitigation: (a) explain in the README which Cucumber components are used, (b) commit the **Cucumber HTML report** (it looks exactly like cucumber-js output) and the Cucumber JSON, (c) keep a classic Cucumber look: `features/`, `steps/`, Given/When/Then, tag expressions.
- A reviewer may raise the generated `.features-gen` step. Answer: it is a documented design choice (see the FAQ) that enables UI mode and the IDE integration. Gitignore it.

### Gotchas, by runner

playwright-bdd:
- You must run `bddgen` before `playwright test`, for example `"test": "bddgen && playwright test"`. Running `npx playwright test` on a stale `.features-gen` means you test old features.
- Missing steps fail at **generation** time (`missingSteps: 'fail-on-gen'` default). `npx bddgen` prints snippets.
- v9 checks step arity: the function must take exactly the number of captured params, plus a DataTable or DocString argument when present. Otherwise generation fails.
- The first step argument must be an object destructuring pattern (`{}`). Disable ESLint `no-empty-pattern` for step files.
- `test.use()` cannot be placed in generated files. Use `$tags` plus fixture overrides, or projects, instead.
- Export `test` from your fixtures file. Generated specs import it (`importTestFrom` is auto-detected from the steps glob).
- Cucumber JSON reporter **skips attachments by default** in v9 (`skipAttachments: true`).
- Cucumber HTML with `externalAttachments: true` embeds the trace viewer, but only over `http(s)://`, not `file://`.
- Multiple projects that use different features need a unique `outputDir` each. `defineBddProject()` sets this for you.
- `@retries:N` on a single scenario wraps the test in an anonymous describe.

cucumber-js + Playwright library:
- You own the browser lifecycle: launch in `BeforeAll`, create a context per scenario in `Before`, close it in `After`. Leaks and flakiness follow if you get it wrong.
- Default step timeout is 5s (`setDefaultTimeout`). Playwright actions often exceed it.
- With `--parallel`, each worker re-runs `BeforeAll`, and there is no fixture scoping.
- No trace viewer, Playwright HTML report or UI mode unless you wire them up yourself.
- Node engines: cucumber-js 13 needs Node 22/24/26+. Node 20 is not supported.

---

## 2. Recommended setup with playwright-bdd

### 2.1 Install

```bash
npm init -y
npm i -D @playwright/test@1.63.0 playwright-bdd@9.2.1 typescript@~6.0.3 @types/node@22 \
  dotenv@18 zod@4 cross-env@10
npx playwright install --with-deps chromium     # add firefox/webkit if needed

# lint/format
npm i -D eslint@10 @eslint/js@10 typescript-eslint@8 eslint-plugin-playwright@2 \
  eslint-config-prettier@10 prettier@3 prettier-plugin-gherkin@4
```

Source: https://vitalets.github.io/playwright-bdd/#/getting-started/installation (raw: https://github.com/vitalets/playwright-bdd/blob/main/docs/getting-started/installation.md). The installation page says it requires Node 20+ and Playwright 1.53+.

### 2.2 package.json scripts

```jsonc
{
  "scripts": {
    "bddgen": "bddgen",
    "test": "bddgen && playwright test",
    "test:ui": "bddgen && playwright test --project=ui",
    "test:api": "bddgen && playwright test --project=api",
    "test:smoke": "bddgen --tags \"@smoke\" && playwright test",
    "test:headed": "bddgen && playwright test --headed",
    "test:staging": "cross-env-shell TEST_ENV=staging \"bddgen && playwright test\"",
    "pw:ui": "bddgen && playwright test --ui",
    "report": "playwright show-report reports/playwright-html",
    "report:cucumber": "npx http-server ./reports/cucumber -c-1 -a localhost -o index.html",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write ."
  }
}
```

Use `cross-env-shell` (not `cross-env`) so that the variable reaches **both** `bddgen` and `playwright test`, as the playwright-bdd env-variables guide recommends.

### 2.3 Typed environment config (`src/config/env.ts`)

```ts
// src/config/env.ts
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const TEST_ENV = process.env.TEST_ENV ?? 'local';

// First value wins (no override): real env vars > .env.<env>.local > .env.<env> > .env
dotenv.config({
  path: [
    path.resolve(process.cwd(), `.env.${TEST_ENV}.local`), // git-ignored secrets
    path.resolve(process.cwd(), `.env.${TEST_ENV}`),
    path.resolve(process.cwd(), '.env'),
  ],
  quiet: true, // dotenv >=17 logs "injecting env" by default
});

const EnvSchema = z.object({
  TEST_ENV: z.enum(['local', 'staging', 'prod']).default('local'),
  UI_BASE_URL: z.url(),                      // https://emicalculator.net
  API_BASE_URL: z.url(),                     // http://localhost:3000
  API_TOKEN: z.string().min(1).optional(),   // secret, from CI secrets / .local file
  HEADLESS: z.stringbool().default(true),    // zod 4: "true"/"false"/"1"/"0"
  WORKERS: z.coerce.number().int().positive().optional(),
  RETRIES: z.coerce.number().int().min(0).optional(),
  DEFAULT_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
});

const parsed = EnvSchema.safeParse({ ...process.env, TEST_ENV });
if (!parsed.success) {
  // Fail fast with a readable message; never print secret values
  console.error('Invalid test environment configuration:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
export type Env = typeof env;
```

`.env.local` (committed, no secrets):
```dotenv
UI_BASE_URL=https://emicalculator.net
API_BASE_URL=http://localhost:3000
```
`.env.example` (committed) documents every key. `.env.*.local` is git-ignored. In CI, pass secrets as `env:` from `${{ secrets.X }}`.

Notes:
- Node 20.12+ / 22 has `process.loadEnvFile(path)` built in. It works, but dotenv's multi-file precedence plus zod validation is clearer for reviewers.
- `playwright.config.ts` is evaluated in the main process **and in every worker**, so loading env inside the config module makes it available everywhere.
- Never hardcode URLs in page objects or steps. Use `page.goto('/')` and the project `baseURL`.

Sources: dotenv README https://github.com/motdotla/dotenv (path arrays, `quiet`, `override`), Playwright parameterize docs https://playwright.dev/docs/test-parameterize#env-files, zod v4 https://zod.dev/api.

### 2.4 `playwright.config.ts` (UI + API projects, both reports)

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import { defineBddProject, cucumberReporter } from 'playwright-bdd';
import { env } from './src/config/env';

const isCI = !!process.env.CI;

export default defineConfig({
  // Each BDD project sets its own testDir via defineBddProject.
  outputDir: 'reports/test-results',          // screenshots, traces, videos per test
  fullyParallel: true,
  forbidOnly: isCI,                           // fails CI if @only / test.only slipped in
  retries: env.RETRIES ?? (isCI ? 2 : 0),
  workers: env.WORKERS ?? (isCI ? 2 : undefined),
  timeout: env.DEFAULT_TIMEOUT_MS,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/playwright-html', open: 'never' }],
    cucumberReporter('html', { outputFile: 'reports/cucumber/index.html', externalAttachments: true }),
    cucumberReporter('json', { outputFile: 'reports/cucumber/report.json', addProjectToFeatureName: true }),
    cucumberReporter('junit', { outputFile: 'reports/cucumber/report.xml', suiteName: 'streamhub' }),
  ],

  use: {
    headless: env.HEADLESS,
    screenshot: 'only-on-failure',            // auto-attached to PW + Cucumber reports
    trace: 'retain-on-failure',               // or 'on-first-retry'
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    testIdAttribute: 'data-testid',
  },

  projects: [
    {
      ...defineBddProject({
        name: 'ui',
        features: 'features/ui/**/*.feature',
        steps: ['src/steps/ui/**/*.ts', 'src/fixtures/**/*.ts', 'src/hooks/**/*.ts'],
      }),
      use: { ...devices['Desktop Chrome'], baseURL: env.UI_BASE_URL },
    },
    {
      ...defineBddProject({
        name: 'api',
        features: 'features/api/**/*.feature',
        steps: ['src/steps/api/**/*.ts', 'src/fixtures/**/*.ts', 'src/hooks/**/*.ts'],
      }),
      use: {
        baseURL: env.API_BASE_URL,            // used by the `request` fixture
        extraHTTPHeaders: env.API_TOKEN ? { Authorization: `Bearer ${env.API_TOKEN}` } : {},
      },
    },
  ],

  // Optional: start our own REST API before API tests
  // webServer: { command: 'npm run api:start', url: `${env.API_BASE_URL}/health`, reuseExistingServer: !isCI },
});
```

Notes:
- The `html` reporter `outputFolder` must not be inside `outputDir`, because Playwright cleans `outputDir` and warns about the clash. The layout above keeps them as siblings.
- The `api` project uses the `request` fixture only. Playwright launches a browser lazily, only when `page`, `context` or `browser` is requested, so API tests start no browser.
- Valid modes in 1.63 (from `test.d.ts`): ScreenshotMode `off | on | only-on-failure | on-first-failure`. TraceMode and VideoMode `off | on | retain-on-failure | on-first-retry | on-all-retries | retain-on-first-failure | retain-on-failure-and-retries`.

Sources: https://github.com/vitalets/playwright-bdd/blob/main/docs/configuration/multiple-projects.md, https://github.com/vitalets/playwright-bdd/blob/main/docs/reporters/cucumber.md, https://playwright.dev/docs/test-configuration, https://playwright.dev/docs/test-reporters.

### 2.5 Fixtures that inject Page Objects (no World)

```ts
// src/fixtures/index.ts
import { test as base, createBdd } from 'playwright-bdd';
import { EmiCalculatorPage } from '../pages/EmiCalculatorPage';
import { ProductsApi } from '../api/ProductsApi';
import { createLogger, type Logger } from '../utils/logger';

type ScenarioContext = Record<string, unknown>;

type Fixtures = {
  emiPage: EmiCalculatorPage;
  productsApi: ProductsApi;
  ctx: ScenarioContext;          // replaces Cucumber World for cross-step data
  log: Logger;
};

export const test = base.extend<Fixtures>({
  emiPage: async ({ page }, use) => {
    await use(new EmiCalculatorPage(page));
  },
  productsApi: async ({ request }, use) => {
    await use(new ProductsApi(request));
  },
  ctx: async ({}, use) => {
    await use({});
  },
  // Per-scenario log, attached to both reports at teardown
  log: async ({}, use, testInfo) => {
    const logger = createLogger(testInfo.title);
    await use(logger);
    await testInfo.attach('scenario.log', { body: logger.dump(), contentType: 'text/plain' });
  },
});

export const { Given, When, Then, Before, After, BeforeAll, AfterAll, BeforeStep, AfterStep } =
  createBdd(test);
```

Steps:
```ts
// src/steps/ui/emi.steps.ts
import { expect } from '@playwright/test';
import { Given, When, Then } from '../../fixtures';

Given('I am on the EMI calculator', async ({ emiPage }) => {
  await emiPage.open();
});

When(
  'I calculate a {word} loan of {int} at {float}% for {int} years',
  async ({ emiPage }, type: string, amount: number, rate: number, years: number) => {
    await emiPage.selectLoanType(type);
    await emiPage.fill({ amount, rate, years });
  },
);

Then('the monthly EMI should be {string}', async ({ emiPage }, expected: string) => {
  await expect(emiPage.emiValue).toHaveText(expected);
});
```

API step plus a POM-like API client:
```ts
// src/api/ProductsApi.ts
import type { APIRequestContext, APIResponse } from '@playwright/test';
export class ProductsApi {
  constructor(private readonly request: APIRequestContext) {}
  list(): Promise<APIResponse> { return this.request.get('products'); }   // relative to baseURL
  create(body: unknown): Promise<APIResponse> { return this.request.post('products', { data: body }); }
}
```
```ts
// src/steps/api/products.steps.ts
import { expect, type APIResponse } from '@playwright/test';
import { When, Then } from '../../fixtures';

When('I request the product list', async ({ productsApi, ctx }) => {
  ctx.response = await productsApi.list();
});

Then('the response status should be {int}', async ({ ctx }, status: number) => {
  expect((ctx.response as APIResponse).status()).toBe(status);
});
```
Gotcha: with `baseURL: 'http://host/api'`, `request.get('/products')` drops `/api`, because the URL is resolved like a browser URL. Either put a trailing slash on baseURL and use relative paths with no leading slash, or keep baseURL at the origin.

### 2.6 Page Object with resilient locators

```ts
// src/pages/BasePage.ts
import type { Page } from '@playwright/test';
export abstract class BasePage {
  constructor(protected readonly page: Page) {}
  protected abstract readonly path: string;
  async open() { await this.page.goto(this.path); }
}

// src/pages/EmiCalculatorPage.ts
import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class EmiCalculatorPage extends BasePage {
  protected readonly path = '/';
  readonly loanAmount: Locator;
  readonly interestRate: Locator;
  readonly tenureYears: Locator;
  readonly emiValue: Locator;

  constructor(page: Page) {
    super(page);
    // Priority: role/label/text (user-facing) > test id > stable id > CSS. Avoid XPath/nth().
    this.loanAmount = page.getByRole('textbox', { name: /loan amount/i }).or(page.locator('#loanamount'));
    this.interestRate = page.getByLabel(/interest rate/i).or(page.locator('#loaninterest'));
    this.tenureYears = page.getByLabel(/loan tenure/i).or(page.locator('#loanterm'));
    this.emiValue = page.locator('#emiamount span');
  }

  async selectLoanType(type: string) {
    await this.page.getByRole('link', { name: new RegExp(`${type} loan`, 'i') }).click();
  }

  async fill({ amount, rate, years }: { amount: number; rate: number; years: number }) {
    await this.loanAmount.fill(String(amount));
    await this.loanAmount.press('Tab');   // third-party sites often recalc on blur/change
    await this.interestRate.fill(String(rate));
    await this.interestRate.press('Tab');
    await this.tenureYears.fill(String(years));
    await this.tenureYears.press('Tab');
  }
}
```
Verify the actual DOM of emicalculator.net before relying on these ids (see the separate site-analysis research). `locator.or()` is useful as a "self-healing light" fallback. It is strict, so ensure only one branch matches, or append `.first()`.

### 2.7 Hooks

Prefer fixtures. Use hooks for cross-cutting behaviour and tag-scoped setup.
```ts
// src/hooks/index.ts
import { Before, After, BeforeAll } from '../fixtures';

BeforeAll(async ({ $workerInfo }) => {
  // once per worker (no World/test fixtures here; only worker fixtures)
});

Before({ tags: '@ui' }, async ({ page, context }) => {
  // e.g. dismiss cookie/consent banners on a 3rd-party site (choose "reject non-essential")
  await context.addInitScript(() => { /* set consent cookie/localStorage if known */ });
  page.on('pageerror', (err) => console.warn('[pageerror]', err.message));
});

After(async ({ page, $testInfo }) => {
  // Built-in screenshot:'only-on-failure' already attaches; this adds a named full-page shot.
  if ($testInfo.status !== $testInfo.expectedStatus && page) {
    await $testInfo.attach('failure-fullpage', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }
});
```
Caveat: requesting `page` in an `After` hook used by API scenarios creates a browser. Scope the hook with `{ tags: '@ui' }`.
Sources: https://github.com/vitalets/playwright-bdd/blob/main/docs/writing-steps/hooks/scenario-hooks.md and .../worker-hooks.md.

### 2.8 Tags strategy

```gherkin
@ui @emi
Feature: EMI calculation

  @smoke
  Scenario: ...

  @fail @known-bug-123        # expected to fail -> test.fail(); report shows "expected failure"
  Scenario: ...

  @fixme                      # skipped (alias of @skip)
  Scenario: ...

  @retries:2 @timeout:60000
  Scenario: flaky third-party widget ...
```
- Built-in special tags: `@only`, `@skip`/`@fixme`, `@fail` (maps to Playwright `test.fail()`: the test passes if it fails, and is reported as failing if it unexpectedly passes), `@slow` (timeout x3), `@timeout:N`, `@retries:N`, `@mode:serial|parallel|default`.
- Custom tags (`@smoke`, `@regression`, `@api`, `@ui`, `@self-healing`, `@broken`) are for filtering:
  - At generation: `bddgen --tags "@smoke and not @broken"` (Cucumber tag-expression syntax), or `tags` in `defineBddProject`.
  - At run time: `playwright test --grep @smoke` / `--grep-invert @broken`. In PowerShell, escape `|` (`--grep --% "@a^|@b"`, see the Playwright docs).
- Tags from path: `features/@api/products.feature` auto-tags `@api` and **scopes** steps in that folder.
- `@broken` handling: add `@fail` for "documented known defect" so the suite stays green and the report still shows it, or `@fixme` to skip. You can also do it programmatically:
```ts
export const test = base.extend<{ knownBug: void }>({
  knownBug: [async ({ $tags }, use, testInfo) => {
    if ($tags.includes('@broken')) testInfo.fail(true, 'Known defect - see README');
    await use();
  }, { auto: true }],
});
```
Sources: https://github.com/vitalets/playwright-bdd/blob/main/docs/writing-features/special-tags.md, .../tags-from-path.md, .../writing-steps/bdd-fixtures.md, https://playwright.dev/docs/test-annotations.

### 2.9 Traces, retries, parallelism

- `trace: 'retain-on-failure'` (or `'on-first-retry'` with `retries > 0`). View with `npx playwright show-trace reports/test-results/<test>/trace.zip` or https://trace.playwright.dev.
- `retries` globally, or `@retries:N` per scenario/feature. A test that passes on retry is marked **flaky** in the Playwright report.
- `fullyParallel: true` runs scenarios in parallel across workers. `@mode:serial` is for features that share state. Keep the third-party site gentle: use `workers: 2` in CI for the `ui` project, or set `--workers`.

---

## 3. Folder structure and conventions

```
.
├── features/
│   ├── ui/
│   │   └── emi-calculator.feature
│   └── api/
│       └── products.feature
├── src/
│   ├── config/env.ts            # dotenv + zod typed config
│   ├── fixtures/index.ts        # test.extend + createBdd exports (Given/When/Then/hooks)
│   ├── hooks/index.ts
│   ├── steps/
│   │   ├── ui/emi.steps.ts
│   │   └── api/products.steps.ts
│   ├── pages/                   # Page Objects (BasePage + one class per page/component)
│   │   ├── BasePage.ts
│   │   └── EmiCalculatorPage.ts
│   ├── api/                     # API clients (POM-equivalent for REST)
│   │   └── ProductsApi.ts
│   ├── data/                    # test data / schemas (json, zod schemas for responses)
│   └── utils/                   # logger, number formatting, emi formula helper
├── reports/                     # committed results (see section 5)
│   ├── playwright-html/
│   ├── cucumber/{index.html,report.json,report.xml}
│   └── test-results/            # screenshots/traces (failures only)
├── .features-gen/               # generated; gitignored
├── .env.example  .env.local  .env.staging
├── playwright.config.ts
├── tsconfig.json  eslint.config.mjs  .prettierrc  .prettierignore
└── .github/workflows/tests.yml
```
Naming: `kebab-case.feature`, `<domain>.steps.ts`, `PascalCasePage.ts` for classes, fixtures in `camelCase` (`emiPage`), tags in lowercase kebab.

### tsconfig.json (TypeScript 6)

```jsonc
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "preserve",
    "moduleResolution": "bundler",
    "noEmit": true,                    // Playwright transpiles; tsc only type-checks
    "strict": true,                    // default in TS 6, keep explicit
    "types": ["node"],                 // TS 6 default is [] - add explicitly!
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src", "playwright.config.ts"],
  "exclude": ["node_modules", ".features-gen", "reports"]
}
```
TS 6 deprecates `baseUrl` and `moduleResolution: node`/`node10`. Use `paths` without `baseUrl` if you want aliases (Playwright honours tsconfig `paths`). Source: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html. Playwright does **not** type-check, so run `tsc --noEmit` in CI.

### eslint.config.mjs (flat config, ESLint 10)

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['.features-gen/**', 'reports/**', 'node_modules/**']),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/steps/**/*.ts', 'src/pages/**/*.ts', 'src/fixtures/**/*.ts', 'src/hooks/**/*.ts'],
    extends: [playwright.configs['flat/recommended']],
    rules: {
      'no-empty-pattern': 'off',                 // ({}) required by Playwright fixtures
      'playwright/no-standalone-expect': 'off',  // expect() inside BDD step fns (not inside test())
      'playwright/no-networkidle': 'error',
      'playwright/no-wait-for-timeout': 'error',
      'playwright/prefer-web-first-assertions': 'error',
    },
  },
  prettier,
]);
```
`defineConfig` comes from `eslint/config`. The eslint-plugin-playwright README shows `@eslint/config`, but that package does **not** exist on npm (404, verified).
Sources: https://github.com/mskelton/eslint-plugin-playwright, https://typescript-eslint.io/getting-started, https://github.com/vitalets/playwright-bdd/blob/main/docs/faq.md.

Prettier, as in the official example: `{ "singleQuote": true, "printWidth": 100, "trailingComma": "all", "plugins": ["prettier-plugin-gherkin"] }`. In `.prettierignore` add `**/.features-gen/**/*.spec.js` and `reports/`.

`.gitignore`:
```
node_modules/
.features-gen/
.env.*.local
.env.local.secrets
blob-report/
playwright/.cache/
# do NOT ignore reports/ - we commit results deliberately
```

---

## 4. Reporting and committing results

What you get:
1. **Playwright HTML** (`reports/playwright-html/index.html`): per-step tree (BDD steps appear as test steps), screenshots, video, embedded trace viewer, flaky and retry info.
2. **Cucumber HTML** (`reports/cucumber/index.html`): the official @cucumber/html-formatter UI, with Feature/Scenario/Step, tags, attachments, and project names prepended.
3. **Cucumber JSON** (`reports/cucumber/report.json`): for `multiple-cucumber-html-reporter` 4.4.2 or other dashboards (attachments are skipped by default in v9).
4. **JUnit XML** for CI test summaries.
5. **Logs**: the per-scenario `scenario.log` attachment (from the fixture), plus `list` reporter console output. Optionally tee it: `npm test 2>&1 | tee reports/run.log` (bash), or `Tee-Object` in PowerShell.

Committing to the repo (an assessment requirement):
- Run locally or in CI, then commit `reports/` with the run date in the README (for example "Last run: 2026-10-xx, 14 passed / 1 expected-fail").
- Keep the size small. Use `screenshot: 'only-on-failure'`, `trace: 'retain-on-failure'`, and `video: 'off'` or `'retain-on-failure'`. In the Cucumber HTML you can pass `skipAttachments: ['video/webm']`. GitHub rejects files over 100 MB and warns above 50 MB.
- `externalAttachments: true` writes attachments into `reports/cucumber/data/`. The HTML stays small, but commit the folder too.
- Opening `file://.../index.html` works for the Playwright report (except some trace features) and for the Cucumber report (except the embedded trace). Document `npm run report` / `npm run report:cucumber`.
- Bonus: publish to GitHub Pages from CI so assessors get a clickable link.

### GitHub Actions (based on the official Playwright sample, ci-intro.md)

```yaml
# .github/workflows/tests.yml
name: Tests
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      CI: 'true'
      TEST_ENV: local
      API_TOKEN: ${{ secrets.API_TOKEN }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run typecheck && npm run lint
      # - run: npm run api:start &   # if our REST API isn't started via webServer
      - run: npm test
      - uses: actions/upload-artifact@v7
        if: ${{ !cancelled() }}
        with:
          name: reports
          path: reports/
          retention-days: 30
      - uses: actions/upload-pages-artifact@v5
        if: ${{ !cancelled() && github.ref == 'refs/heads/main' }}
        with: { path: reports/ }
  deploy-report:
    needs: test
    if: ${{ !cancelled() && github.ref == 'refs/heads/main' }}
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: '${{ steps.deployment.outputs.page_url }}' }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```
Official sample: https://playwright.dev/docs/ci-intro (raw: https://github.com/microsoft/playwright/blob/main/docs/src/ci-intro.md). It uses `npm ci`, `npx playwright install --with-deps`, `npx playwright test`, and `upload-artifact` with `if: ${{ !cancelled() }}`. Enable Pages (Settings > Pages > Source: GitHub Actions). Note that the deploy-report job runs even when tests fail, which is the intent. Gate PR status on the `test` job.

Sharding: `--shard i/n` with `reporter: 'blob'`, then `npx playwright merge-reports --config playwright.config.ts ./blob-report`, which produces merged Cucumber reports too. This is overkill for the assessment.

---

## 5. Gherkin best practices

1. **Declarative, not imperative.** Describe behaviour and business intent, not clicks or selectors.
   ```gherkin
   # Bad
   When I click "#loanamount" and type "1000000" and press Tab
   # Good
   When I enter a home loan of 1,000,000 at 8.5% for 20 years
   ```
2. **One behaviour per scenario.** Keep 3-7 steps. Use Given (context), When (one action), Then (observable outcome).
3. **Background** only for shared *context* that every scenario needs and that the reader must know. Keep it short.
4. **Scenario Outline + Examples** for data-driven cases. Name examples with `examplesTitleFormat` if useful.
   ```gherkin
   @ui @emi
   Feature: EMI calculator
     As a borrower I want to know my monthly instalment so that I can plan repayments

     Background:
       Given I am on the EMI calculator

     @smoke
     Scenario Outline: EMI is calculated for a <type> loan
       When I calculate a <type> loan of <amount> at <rate>% for <years> years
       Then the monthly EMI should be "<emi>"

       Examples:
         | type     | amount  | rate | years | emi    |
         | home     | 5000000 | 8.5  | 20    | 43,391 |
         | personal | 750000  | 11   | 5     | 16,307 |
   ```
   (Compute the expected EMI values with the formula `E = P·r·(1+r)^n / ((1+r)^n − 1)` in a util and cross-check them against the site. Do not trust hand-typed numbers.)
5. **Domain language.** Use the product's terms (EMI, tenure, principal), and the same term for the same concept everywhere.
6. **Reusable, parameterised steps** with Cucumber Expressions (`{int}`, `{float}`, `{string}`, `{word}`, or custom parameter types). Avoid regexes unless needed.
7. **No assertions in Given/When, no actions in Then.**
8. **Independent scenarios.** No ordering dependency. Use `@mode:serial` only deliberately.
9. **Tags as metadata** (`@smoke`, `@regression`, `@api`, `@ui`, `@known-bug-<id>`), not as control flow.
10. **API features** stay behavioural too:
    ```gherkin
    @api
    Feature: Products API
      Scenario: Creating a product returns it with an id
        When I create a product named "Widget" priced 9.99
        Then the response status should be 201
        And the response body should contain a product named "Widget" with an id
    ```
11. Use data tables for structured inputs and doc strings for JSON payloads (playwright-bdd v9 exposes `$step.docStringType`).

Sources: https://cucumber.io/docs/bdd/better-gherkin/, https://cucumber.io/docs/gherkin/reference/, https://github.com/vitalets/playwright-bdd/blob/main/docs/faq.md (BDD is a collaboration technique).

---

## 6. Top gotchas (consolidated)

1. **`bddgen` must run before `playwright test`.** Bake it into npm scripts. Use `cross-env-shell` so env vars reach both commands.
2. **TypeScript 7 vs typescript-eslint.** `typescript@latest` is 7.0.2 (the Go port), but typescript-eslint 8.71 has a peer of `typescript <6.1.0`. Pin `typescript@~6.0.3`, as the official playwright-bdd example does. TS 6 also defaults `types: []`, so add `"types": ["node"]`.
3. **Step arity check (v9).** Function params must equal captured args (+ DataTable/DocString), and the first param must be `{}` destructuring. Turn off ESLint `no-empty-pattern` and `playwright/no-standalone-expect` for step files.
4. **Reports layout.** The Playwright HTML `outputFolder` must not live inside `outputDir`. The Cucumber JSON skips attachments by default. The Cucumber HTML trace viewer needs `externalAttachments: true` and `http://` serving.
5. **Lazy browser.** API scenarios stay browser-free only if no step, hook or fixture they use requests `page`/`context`. Tag-scope UI hooks (`Before({ tags: '@ui' })`).
6. **baseURL path joining.** A leading `/` in `request.get('/x')` or `page.goto('/x')` drops any path segment of baseURL.
7. **Expected failures.** `@fail` = `test.fail()`. The run stays green if the scenario fails, and it is flagged if it unexpectedly passes. `@fixme`/`@skip` = skipped. Pick one convention and document it, for example `@broken` mapped to `testInfo.fail()` via an auto fixture.
8. **Env loading.** dotenv 17+/18 prints an injection banner unless `quiet: true`. Load env inside the config import chain (evaluated in every worker), validate with zod v4 (`z.url()`, `z.stringbool()`), and never log secret values.
9. **Third-party site (emicalculator.net).** Expect ads, consent banners and recalculation on blur/slider change. Use web-first assertions (`toHaveText`), never `waitForTimeout` or `networkidle`, keep `workers` low and allow `retries: 2` in CI.
10. **cucumber-js 13 needs Node 22+**, if you add it for a custom formatter. playwright-bdd and Playwright need Node 20+. Standardise on **Node 22 LTS** locally and in CI.

---

## Sources

- playwright-bdd docs: https://vitalets.github.io/playwright-bdd/ (raw docs in https://github.com/vitalets/playwright-bdd/tree/main/docs). Pages used: getting-started/installation, write-first-test, add-fixtures; configuration/options, multiple-projects; reporters/cucumber, reporters/playwright; writing-features/special-tags, tags-from-path; writing-steps/bdd-fixtures, passing-data-between-steps, hooks/scenario-hooks, hooks/worker-hooks; guides/migration-v9, env-variables, ignore-generated-files; faq
- Official example project: https://github.com/vitalets/playwright-bdd-example (playwright 1.63, playwright-bdd 9.2.1, typescript 6.0.3)
- API-testing example: https://github.com/vitalets/playwright-bdd/tree/main/examples/api-testing
- Playwright: https://playwright.dev/docs/ci-intro, https://playwright.dev/docs/test-parameterize, https://playwright.dev/docs/test-annotations, https://playwright.dev/docs/test-reporters, https://playwright.dev/docs/locators, types `packages/playwright/types/test.d.ts`
- cucumber-js configuration and transpiling: https://github.com/cucumber/cucumber-js/blob/main/docs/configuration.md, https://github.com/cucumber/cucumber-js/blob/main/docs/transpiling.md
- dotenv: https://github.com/motdotla/dotenv
- zod v4: https://zod.dev
- TypeScript 6.0 release notes: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html
- eslint-plugin-playwright: https://github.com/mskelton/eslint-plugin-playwright
- Cucumber Gherkin guidance: https://cucumber.io/docs/bdd/better-gherkin/, https://cucumber.io/docs/gherkin/reference/
- npm registry (`npm view`) and GitHub API data retrieved 2026-10-05.
