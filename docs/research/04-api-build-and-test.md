# 04 — Section B: Build a mock-data API and test it with Playwright (BDD)

Research date: 2026-10-05. Package versions checked with `npm view <pkg> version` that day. Local Node is v22.14.0.

> Status: the API skeleton in section 2 was **prototyped and run** in a scratch folder (Hono 4.13 + zod 4.6 + tsx). The status codes and bodies shown are real output from that run, not guesses.

---

## 0. TL;DR recommendation

| Decision | Choice | Why (short) |
|---|---|---|
| API framework | **Hono 4 + `@hono/node-server`** | Small, TS-first, Web-standard `Request/Response`, first-party zod validator, `app.request()` lets you unit-test without opening a port |
| Validation | **zod 4** (`z.strictObject` + `z.coerce`) | One schema library for both API validation **and** response-shape checks in the Playwright tests |
| Runner | **`tsx`** (`npm start` = `tsx src/server.ts`) | No build step for reviewers. `tsc --noEmit` stays as a separate `typecheck` script |
| Data | JSON files in `api/data/*.json`, loaded into memory once at startup | Matches the "no real DB" rule. Read-only, so tests are deterministic |
| Domain | **IPL players / teams / matches** (fits the SQL theme) | Has good fields for filtering, sorting, search and ranges |
| Error format | **RFC 9457 `application/problem+json`** with an `errors[]` extension | It is a standard, and every error has the same shape, so tests can assert it |
| Invalid query param | **400** | It is a client error in the URI. Save 422 for bodies (and there are no write endpoints) |
| Unknown query param | **Reject with 400** (`z.strictObject`) | Catches typos like `?limt=5`. Easy to test. Write the decision down in the README |
| Pagination | `page` + `limit` (default 1/10, max 100). Envelope `{ data, meta: { page, limit, total, totalPages } }` | Easy for a reviewer to read. Simple to assert |
| Sort | `sort=-runs` (comma list, `-` prefix = descending) | One parameter, can sort on several fields. JSON:API-style convention |
| Tests | playwright-bdd 9 with the `request` fixture inside a custom `ApiClient` fixture, `webServer` auto-starts the API, zod schemas check response shape | Matches the feature/step/page structure used for the UI tests |

### Verified versions (2026-10-05)

| Package | Version | Notes |
|---|---|---|
| hono | 4.13.13 | engines node >=16.9 |
| @hono/node-server | 2.1.3 | engines node >=20, peer hono ^4 |
| @hono/zod-validator | 0.9.1 | peer zod ^3.25 \|\| ^4, hono >=4.11.2 |
| @hono/zod-openapi | 1.6.3 | optional, for an OpenAPI doc |
| @hono/swagger-ui | 0.6.1 | optional |
| zod | 4.6.5 | |
| express | 5.2.1 | alternative |
| fastify | 5.12.5 | alternative |
| @sinclair/typebox | 0.34.52 / @fastify/type-provider-typebox 6.1.0 | Fastify route |
| ajv | 8.20.0 | |
| @playwright/test | 1.63.0 | |
| playwright-bdd | 9.2.1 | peer @playwright/test >=1.44, node >=20 |
| tsx | 4.23.15 | |
| typescript | 7.0.2 (latest = native/Go compiler) | Fine for `tsc --noEmit`. If any tool needs the TS JS API, pin `typescript@~5.9` (TS 6 only has a beta dist-tag) |
| vitest | 5.0.3 | optional API unit tests |
| supertest | 7.3.1 | not needed with Hono (`app.request`) |

---

## 1. Framework comparison: Express 5 vs Fastify 5 vs Hono 4

| Criterion | Express 5.2 | Fastify 5.12 | Hono 4.13 |
|---|---|---|---|
| TS story | `@types/express`. `req.query` is typed `any`-ish. Express 5 made `req.query` a **read-only getter**, so you can't overwrite it with parsed values (store them in `res.locals`) | Very good with type providers (TypeBox/zod), schema-driven | Native TS. `c.req.valid('query')` is typed from the schema |
| Query validation | DIY middleware (zod `safeParse`) | Built-in ajv (JSON Schema) through route `schema.querystring`. Coerces types by default. The 400 error shape is Fastify's own unless you write a custom `setErrorHandler` | `zValidator('query', schema, hook)`. Default failure is `c.json(result, 400)` (checked in source). The hook gives full control over the body |
| Async errors | Express 5 forwards rejected promises to error middleware (new in v5) | Native | Native (`app.onError`) |
| Default query parser | Express 5 changed the default from `extended` (qs) to `simple` (node querystring). Repeated keys turn into arrays | querystring. Arrays on repeat | Validator turns repeated keys into an array, single ones into a string (checked in `validator.ts`) |
| In-process testing | needs supertest | `app.inject()` | `app.request('/path')` (no port) |
| OpenAPI | swagger-jsdoc (manual) | `@fastify/swagger` 9.9 from route schemas (best in class) | `@hono/zod-openapi` (same zod schemas) |
| Boilerplate | small | medium (plugins, type provider setup) | smallest |
| Reviewer familiarity | highest | medium | medium, rising |

**Pick: Hono.** The API is small, read-only and typed. Hono gives a typed validated query in about 5 lines, a single error hook for RFC 9457, and `app.request()` for optional unit tests. The bigger reason is that **zod is shared**: the same `PlayerSchema` checks the API's output in the Playwright steps, so there is one source of truth.

**When to choose otherwise:**
- **Fastify** if the reviewer cares most about schema-first design and auto-generated OpenAPI. It is a little more ceremony.
- **Express** if the team wants the most familiar option. Plan to hand-roll validation middleware.

Sources: https://hono.dev/docs/guides/validation, https://github.com/honojs/middleware/tree/main/packages/zod-validator (src/index.ts line `return c.json(result, 400)`), https://github.com/honojs/hono/blob/main/src/validator/validator.ts, https://expressjs.com/en/guide/migrating-5.html, https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/

---

## 2. API design

### 2.1 Domain: IPL (reuses the SQL theme)

Data files (all read-only, loaded once):

```
api/data/teams.json     ~10 rows   { id:"MI", name:"Mumbai Indians", city:"Mumbai", titles:5 }
api/data/players.json   ~40 rows   { id:1, name:"Virat Kohli", teamId:"RCB", role:"BATTER", nationality:"India", age:37, runs:8004, wickets:4, matches:252, strikeRate:132.9 }
api/data/matches.json   ~30 rows   { id:101, season:2024, date:"2024-05-26", venue:"Chennai", homeTeamId:"KKR", awayTeamId:"SRH", winnerTeamId:"KKR", marginRuns:null, marginWickets:8 }
```

Keep the data **hand-curated and frozen**, and use real names with *approximate* stats. The tests depend on exact counts. Use a mix of roles, teams and nationalities so every filter returns several rows, and include at least one tie on a sort field so stable sort can be tested.

### 2.2 Endpoints

| Method + path | Purpose | Query params |
|---|---|---|
| `GET /health` | liveness for `webServer.url` | none (returns `{status:"ok"}`) |
| `GET /api/players` | list | `page`, `limit`, `sort`, `team`, `role`, `nationality`, `minRuns`, `maxRuns`, `q` (name search) |
| `GET /api/players/:id` | one | `:id` positive int |
| `GET /api/matches` | list | `page`, `limit`, `sort` (`date`, `season`), `season` (2008–2025), `team` (home **or** away), `venue`, `from`/`to` (ISO date, `from<=to`) |
| `GET /api/teams` (optional 3rd) | list, small | `sort` |
| any other method on known paths | 405 + `Allow: GET` | |
| unknown path | 404 problem+json | |

That is 3–4 resource endpoints, which is "at least 2–3" with a margin. Every parameter type is covered: enum, int range, date range, free-text search, sort, pagination.

### 2.3 Conventions and decisions

- **Resource naming**: plural nouns, lowercase, `/api` prefix, no verbs (`/api/players`, not `/getPlayers`). Use path params for identity and query params for filtering, sorting and paging.
- **Pagination**: `page` (>=1, default 1) and `limit` (1..100, default 10). `limit>100` gives **400**, not a silent clamp, because silent clamping hides bugs and is harder to test. Write this down.
  - Page past the end (`page=99`) gives **200 with `data: []`** and correct `meta`. It is valid input with an empty result. This is the common convention.
  - Envelope: `{ "data": [...], "meta": { "page":1, "limit":10, "total":42, "totalPages":5 } }`. Optionally also set the `X-Total-Count` header (JSONPlaceholder/json-server do this).
- **Sorting**: `sort=-runs,name`. Allowed fields are whitelisted per resource and a `-` prefix means descending. An unknown field gives 400. Sort must be **stable**, with `id` as the final tie-breaker.
  - Alternative style: `sortBy=runs&order=desc`. Either is fine. Pick one.
- **Filters**: exact match for enums (`team=MI`, case-sensitive per schema, or normalise with `.toUpperCase()`, but decide and document it). Ranges use `minRuns`/`maxRuns`, and `minRuns>maxRuns` gives 400 via `.refine`.
- **Search**: `q` is a case-insensitive substring match on `name`, trimmed, 2–50 chars. `q=` (empty) gives 400, or treat it as absent. Decide, and test whichever you choose.
- **Unknown query params**: **reject (400, `unrecognized_keys`)**. Rationale: the assessment says to "return appropriate status codes and error messages for invalid parameters", and a typo in a param name *is* invalid. Ignoring it would quietly return unfiltered data. Real public APIs often ignore unknown params for forward-compatibility, so say in the README that strictness is a deliberate choice for this API.
- **Repeated params** (`limit=1&limit=2`) arrive as an array, the coercion gives NaN, and the result is 400. That was confirmed in the prototype. Good, test it.
- **Type coercion gotchas (zod 4)**:
  - `z.coerce.number()` turns `""` into **0** and `"1e2"` into 100. Use `z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100))` if you want `limit=` and `limit=1e2` rejected.
  - `"1.5"` with `.int()` gives 400. That is good.
  - For booleans use `z.stringbool()` (zod 4), not `z.coerce.boolean()`, because `"false"` coerces to `true`.
- **Status codes**:
  - `200` success (list or item)
  - `400` invalid or unknown query or path param (malformed `:id` like `abc` or `0`)
  - `404` well-formed id that doesn't exist (`/api/players/9999`) and unknown routes
  - `405` wrong method on a known path, with an `Allow` header. Hono returns **404** by default for an unmatched method (confirmed: `POST /api/players` gave 404), so add `app.all('/api/players', c => problem(c,405,...))` after the GET routes, or a small `methodNotAllowed` helper
  - `406` (optional) if `Accept` excludes JSON. Skip it.
  - `500` is only produced by `app.onError` with a generic message and **no stack trace** (contrast with JSONPlaceholder in section 6, which leaks stacks). No test should ever expect a 500.
- **400 vs 422**: RFC 9110 defines 422 for content that is well-formed but can't be processed. It is most used for **request bodies**. Query string problems are problems with the request target, and 400 is the widely used and expected code for them. This API has no bodies, so use 400 everywhere. Mention 422 in the README as the choice for future POST bodies.
- **Error format: RFC 9457** with media type `application/problem+json`. Members: `type` (URI, default `about:blank`), `title`, `status`, `detail`, `instance`. Add an extension `errors: [{ param, code, message }]`. The RFC's own validation example uses an `errors` array with `detail` and `pointer`, so this shape follows the spec's pattern.
- **Headers**: `Content-Type: application/json` for success. Optional `Cache-Control: no-store`.
- **OpenAPI (nice-to-have)**: `@hono/zod-openapi` (1.6.3) reuses the zod schemas, plus `@hono/swagger-ui` at `/docs`. Only do this if time allows. A hand-written `openapi.yaml` also works.

Sources: https://www.rfc-editor.org/rfc/rfc9457.html, https://www.rfc-editor.org/rfc/rfc9110.html#name-422-unprocessable-content, https://www.rfc-editor.org/rfc/rfc9110.html#name-405-method-not-allowed, https://jsonapi.org/format/#fetching-sorting, https://zod.dev/api#coercion, https://zod.dev/api#stringbool

### 2.4 Layout (same repo as the UI tests)

```
api/
  data/players.json, matches.json, teams.json
  src/
    app.ts            # builds the Hono app (export default app) — no listen()
    server.ts         # serve({ fetch: app.fetch, port: Number(process.env.API_PORT ?? 3001) })
    schemas.ts        # zod: query schemas + entity schemas (exported for tests too)
    problem.ts        # RFC 9457 helper
    repo.ts           # loads JSON, filter/sort/paginate pure functions
    routes/players.ts, matches.ts
package.json scripts:
  "api:start": "tsx api/src/server.ts",
  "api:dev":   "tsx watch api/src/server.ts",
  "typecheck": "tsc --noEmit",
  "test:api":  "bddgen --config playwright.api.config.ts && playwright test --config playwright.api.config.ts"
```

Put the shared zod schemas in `api/src/schemas.ts` (or a `shared/` folder) so the tests import the *same* entity schemas.

### 2.5 Skeleton (prototyped, works)

```ts
// api/src/problem.ts
import type { Context } from 'hono'
export type Issue = { param: string; code: string; message: string }
export const problem = (c: Context, status: 400|404|405|500, title: string, detail: string, extra: Record<string, unknown> = {}) =>
  c.body(JSON.stringify({ type: 'about:blank', title, status, detail, instance: c.req.path, ...extra }),
         status, { 'Content-Type': 'application/problem+json' })
```

```ts
// api/src/schemas.ts
import { z } from 'zod'
const intParam = (min: number, max: number) =>
  z.string().regex(/^\d+$/, 'must be an integer').transform(Number).pipe(z.number().int().min(min).max(max))
export const Team = z.enum(['CSK','MI','RCB','KKR','SRH','DC','PBKS','RR','GT','LSG'])
export const Role = z.enum(['BATTER','BOWLER','ALL_ROUNDER','WICKET_KEEPER'])
const sortOf = (fields: readonly string[]) => z.string().refine(
  s => s.split(',').every(f => fields.includes(f.replace(/^-/, ''))),
  { message: `sort fields must be one of ${fields.join(',')} (prefix - for desc)` })

export const PlayersQuery = z.strictObject({
  page: intParam(1, 10_000).default(1),
  limit: intParam(1, 100).default(10),
  sort: sortOf(['name','runs','wickets','matches','age']).optional(),
  team: Team.optional(),
  role: Role.optional(),
  minRuns: intParam(0, 100_000).optional(),
  maxRuns: intParam(0, 100_000).optional(),
  q: z.string().trim().min(2).max(50).optional(),
}).refine(v => v.minRuns === undefined || v.maxRuns === undefined || v.minRuns <= v.maxRuns,
  { message: 'minRuns must be <= maxRuns', path: ['minRuns'] })

export const Player = z.strictObject({
  id: z.number().int().positive(), name: z.string(), teamId: Team, role: Role,
  nationality: z.string(), age: z.number().int(), runs: z.number().int(), wickets: z.number().int(),
  matches: z.number().int(), strikeRate: z.number(),
})
export const PageMeta = z.strictObject({ page: z.number().int(), limit: z.number().int(), total: z.number().int(), totalPages: z.number().int() })
export const Paged = <T extends z.ZodType>(item: T) => z.strictObject({ data: z.array(item), meta: PageMeta })
export const Problem = z.object({
  type: z.string(), title: z.string(), status: z.number().int(), detail: z.string(), instance: z.string(),
  errors: z.array(z.object({ param: z.string(), code: z.string(), message: z.string() })).optional(),
})
```

```ts
// api/src/app.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z, type ZodError } from 'zod'
import { PlayersQuery } from './schemas'
import { problem } from './problem'
import { listPlayers, getPlayer } from './repo'

const toIssues = (e: ZodError) => e.issues.map(i => ({
  // unrecognized_keys has an empty path; the offending names are in i.keys
  param: i.path.join('.') || ('keys' in i ? (i.keys as string[]).join(',') : ''),
  code: i.code, message: i.message,
}))
const v = <T extends z.ZodType>(target: 'query'|'param', schema: T) =>
  zValidator(target, schema, (r, c) => {
    if (!r.success) return problem(c, 400, 'Bad Request', `Invalid ${target} parameter(s)`, { errors: toIssues(r.error) })
  })

const app = new Hono()
app.get('/health', c => c.json({ status: 'ok' }))
app.get('/api/players', v('query', PlayersQuery), c => c.json(listPlayers(c.req.valid('query'))))
app.get('/api/players/:id', v('param', z.object({ id: z.string().regex(/^[1-9]\d*$/).transform(Number) })), c => {
  const p = getPlayer(c.req.valid('param').id)
  return p ? c.json(p) : problem(c, 404, 'Not Found', `Player ${c.req.param('id')} not found`)
})
for (const path of ['/api/players', '/api/players/:id', '/api/matches'])
  app.all(path, c => { c.header('Allow', 'GET'); return problem(c, 405, 'Method Not Allowed', `${c.req.method} not allowed on ${c.req.path}`) })
app.notFound(c => problem(c, 404, 'Not Found', `No route ${c.req.method} ${c.req.path}`))
app.onError((err, c) => { console.error(err); return problem(c, 500, 'Internal Server Error', 'Unexpected error') })
export default app
```

```ts
// api/src/repo.ts (pure, unit-testable)
import type { z } from 'zod'
import type { PlayersQuery } from './schemas'
import players from '../data/players.json' with { type: 'json' }  // needs "resolveJsonModule": true
export function listPlayers(q: z.output<typeof PlayersQuery>) {
  let rows = players.filter(p =>
    (!q.team || p.teamId === q.team) && (!q.role || p.role === q.role) &&
    (q.minRuns === undefined || p.runs >= q.minRuns) && (q.maxRuns === undefined || p.runs <= q.maxRuns) &&
    (!q.q || p.name.toLowerCase().includes(q.q.toLowerCase())))
  if (q.sort) {
    const keys = q.sort.split(',').map(f => ({ f: f.replace(/^-/, ''), d: f.startsWith('-') ? -1 : 1 }))
    rows = [...rows].sort((a, b) => { for (const { f, d } of keys) { const x = a[f], y = b[f]; if (x !== y) return (x < y ? -1 : 1) * d } return a.id - b.id })
  }
  const total = rows.length, { page, limit } = q
  return { data: rows.slice((page - 1) * limit, page * limit), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}
```

```ts
// api/src/server.ts
import { serve } from '@hono/node-server'
import app from './app'
const port = Number(process.env.API_PORT ?? 3001)
serve({ fetch: app.fetch, port }, i => console.log(`API listening on http://localhost:${i.port}`))
```

**Observed prototype responses** (3-player dataset, `z.coerce` variant):

| Request | Status | Body (abridged) |
|---|---|---|
| `/api/players?team=MI&q=sh` | 200 `application/json` | `{"data":[{"id":2,"name":"Rohit Sharma",...}],"meta":{"page":1,"limit":10,"total":1,"totalPages":1}}` |
| `/api/players?limit=0` | 400 `application/problem+json` | `errors:[{"param":"limit","code":"too_small","message":"Too small: expected number to be >=1"}]` |
| `/api/players?limit=abc&page=-1` | 400 | two issues: page `too_small`, limit `invalid_type` ("received NaN") |
| `/api/players?foo=1` | 400 | `{"param":"foo","code":"unrecognized_keys","message":"Unrecognized key: \"foo\""}` |
| `/api/players?sort=age` (not whitelisted in proto) | 400 | `code:"invalid_format"` + custom message |
| `/api/players?limit=1&limit=2` | 400 | limit `invalid_type` |
| `/api/players?page=99` | 200 | `{"data":[],"meta":{"page":99,...,"total":3}}` |
| `/api/players/999` | 404 | `detail:"Player 999 not found"` |
| `/api/players/abc` | 400 | `detail:"id must be a positive integer"` |
| `/api/nope` | 404 | `detail:"No route GET /api/nope"` |
| `POST /api/players` (no `app.all`) | **404** | so add the explicit 405 handler |

Note: zod messages like "Too small: expected number to be >=1" come from zod 4 defaults. **Don't assert full zod message strings in tests**, because they change between zod versions. Assert `param` and `code`, or set custom messages in the schema and assert those.

---

## 3. Playwright API testing (playwright-bdd)

### 3.1 Config

Use a **separate project or config** so the API suite doesn't start browsers.

```ts
// playwright.api.config.ts
import { defineConfig } from '@playwright/test'
import { defineBddConfig } from 'playwright-bdd'
import { env } from './config/env'          // loads .env.<ENV> (dotenv) -> { apiBaseUrl, apiPort }

const testDir = defineBddConfig({
  features: 'tests/api/features/**/*.feature',
  steps: ['tests/api/steps/**/*.ts', 'tests/api/fixtures.ts'],
  outputDir: '.features-gen/api',
})

export default defineConfig({
  testDir,
  fullyParallel: true,                      // safe: API is read-only
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: env.apiBaseUrl,                // e.g. http://localhost:3001
    extraHTTPHeaders: { Accept: 'application/json' },
  },
  webServer: {
    command: 'npm run api:start',
    url: `${env.apiBaseUrl}/health`,        // waits for 2xx/3xx/4xx
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { API_PORT: String(env.apiPort) },
    stdout: 'pipe',
    name: 'mock-api',
  },
})
```

- `webServer` options (`command`, `url`, `reuseExistingServer`, `timeout`, `env`, `cwd`, `stdout`/`stderr`, `gracefulShutdown`, `wait`, `name`) are confirmed in the docs. It also accepts an **array**, so the UI config can start the web app and the API together if needed. `port` is deprecated in favour of `url`.
- When `ENV=staging` points at an already-deployed API, make `webServer` conditional: `webServer: env.startLocalApi ? {...} : undefined`.
- Alternatively, keep a single config with two `projects` (`ui`, `api`), each with its own `testDir` from `defineBddConfig({ outputDir: ... })`. Separate configs are simpler for reviewers (`npm run test:api`).

Sources: https://playwright.dev/docs/api-testing, https://playwright.dev/docs/test-webserver, https://playwright.dev/docs/api/class-apirequestcontext, https://vitalets.github.io/playwright-bdd/

### 3.2 Fixtures and "page object" for the API (the ApiClient)

The framework's feature/step/page split maps like this: **feature** = Gherkin, **steps** = glue, **"page"** = an `ApiClient`/`PlayersApi` service object that wraps `APIRequestContext`.

```ts
// tests/api/clients/PlayersApi.ts   ("page" layer)
import type { APIRequestContext, APIResponse } from '@playwright/test'
export class PlayersApi {
  constructor(private readonly request: APIRequestContext) {}
  list(params: Record<string, string> = {}): Promise<APIResponse> {
    return this.request.get('/api/players', { params })   // Playwright URL-encodes params
  }
  listRaw(rawQuery: string) { return this.request.get(`/api/players${rawQuery}`) } // for repeated/odd keys
  byId(id: string | number) { return this.request.get(`/api/players/${id}`) }
}
```

```ts
// tests/api/fixtures.ts
import { test as base, createBdd } from 'playwright-bdd'
import type { APIResponse } from '@playwright/test'
import { PlayersApi } from './clients/PlayersApi'
import { MatchesApi } from './clients/MatchesApi'

type Ctx = { query: Record<string, string>; response?: APIResponse; body?: unknown }
export const test = base.extend<{ playersApi: PlayersApi; matchesApi: MatchesApi; ctx: Ctx }>({
  playersApi: async ({ request }, use) => use(new PlayersApi(request)),
  matchesApi: async ({ request }, use) => use(new MatchesApi(request)),
  ctx: async ({}, use) => use({ query: {} }),           // fresh per scenario -> independence
})
export const { Given, When, Then, Before, After } = createBdd(test)
```

- `request` is the built-in fixture. It picks up `baseURL` and `extraHTTPHeaders` from `use` and is **isolated per test** (a new context each time), so scenarios don't share state.
- The `ctx` fixture is scenario-scoped "world" state, which is the playwright-bdd way to replace Cucumber's `this`.
- Use `request.newContext()` only when you need different headers per scenario, for example to test a missing `Accept`.

### 3.3 Feature files: data-driven parameter matrices

```gherkin
# tests/api/features/players.feature
@api
Feature: Players API
  As an API consumer I can list, filter, sort, paginate and search players

  Scenario: Default list returns first page with metadata
    When I request the players list
    Then the response status is 200
    And the response is a valid paginated players list
    And the meta is page 1, limit 10

  Scenario Outline: Filter players by <param>
    When I request the players list with "<param>" = "<value>"
    Then the response status is 200
    And every player has "<field>" equal to "<value>"
    Examples:
      | param | value  | field  |
      | team  | MI     | teamId |
      | role  | BOWLER | role   |

  Scenario Outline: Sort players by <sort>
    When I request the players list with "sort" = "<sort>" and "limit" = "100"
    Then the response status is 200
    And players are sorted by "<field>" "<direction>"
    Examples:
      | sort   | field | direction |
      | runs   | runs  | asc       |
      | -runs  | runs  | desc      |
      | name   | name  | asc       |

  Scenario: Combined filter + sort + pagination + search
    When I request the players list with query:
      | team  | MI    |
      | sort  | -runs |
      | page  | 1     |
      | limit | 2     |
      | q     | sh    |
    Then the response status is 200
    And the response is a valid paginated players list
    And at most 2 players are returned

  Scenario Outline: Invalid query "<query>" is rejected with 400
    When I request the players list with raw query "<query>"
    Then the response status is 400
    And the response is a problem+json with status 400
    And the error list contains param "<param>" with code "<code>"
    Examples:
      | query                  | param   | code              |
      | ?limit=0               | limit   | too_small         |
      | ?limit=101             | limit   | too_big           |
      | ?limit=abc             | limit   | invalid_format    |
      | ?page=-1               | page    | invalid_format    |
      | ?page=1.5              | page    | invalid_format    |
      | ?sort=height           | sort    | custom            |
      | ?team=XYZ              | team    | invalid_value     |
      | ?q=a                   | q       | too_small         |
      | ?minRuns=500&maxRuns=1 | minRuns | custom            |
      | ?limit=1&limit=2       | limit   | invalid_type      |
      | ?foo=bar               | foo     | unrecognized_keys |

  Scenario: Page beyond range returns empty data
    When I request the players list with "page" = "999"
    Then the response status is 200
    And the data array is empty

  Scenario: Get player by id
    When I request player "1"
    Then the response status is 200
    And the response is a valid player with id 1

  Scenario Outline: Player lookup error "<id>"
    When I request player "<id>"
    Then the response status is <status>
    And the response is a problem+json with status <status>
    Examples:
      | id    | status |
      | 99999 | 404    |
      | abc   | 400    |
      | 0     | 400    |
      | -5    | 400    |

  Scenario: Unsupported method
    When I send "POST" to "/api/players"
    Then the response status is 405
    And the "Allow" header is "GET"
```

The expected zod `code` values in the table depend on which schema variant you choose (regex+pipe vs coerce). Run once, then freeze the values. Or assert `param` only plus a custom `message`.

Coverage checklist for the brief:
- Happy path per endpoint: list, by-id, matches list, health.
- Each parameter alone and in combination.
- Boundaries: `limit=1`, `limit=100`, `limit=101`, `page=1`, last page, past the last page.
- Wrong types (`abc`, `1.5`, `-1`, `""`), unsupported enum values, unknown params, repeated params.
- Cross-field validation (`min>max`, `from>to`).
- Missing *required* params. If the brief insists, make one param required, e.g. `GET /api/matches/search` requires `team`, or `season` is required on a stats endpoint. Without that there's nothing to "miss", so **add one required param on purpose** and test its absence (400, `invalid_type`, "expected string, received undefined").
- 404 for unknown id and unknown route. 405 for wrong method.
- Content-Type check: `application/json` vs `application/problem+json`.
- URL-encoding/special characters in `q` (`q=O'Brien`, `q=%20`, unicode).

### 3.4 Steps with schema validation and attachments

```ts
// tests/api/steps/players.steps.ts
import { expect } from '@playwright/test'
import { DataTable } from 'playwright-bdd'
import { Given, When, Then } from '../fixtures'
import { Paged, Player, Problem } from '../../../api/src/schemas'

When('I request the players list', async ({ playersApi, ctx }) => {
  ctx.response = await playersApi.list()
})
When('I request the players list with {string} = {string}', async ({ playersApi, ctx }, k: string, v: string) => {
  ctx.response = await playersApi.list({ [k]: v })
})
When('I request the players list with query:', async ({ playersApi, ctx }, table: DataTable) => {
  ctx.response = await playersApi.list(table.rowsHash())
})
When('I request the players list with raw query {string}', async ({ playersApi, ctx }, q: string) => {
  ctx.response = await playersApi.listRaw(q)
})

Then('the response status is {int}', async ({ ctx, $testInfo }, status: number) => {
  const res = ctx.response!
  const text = await res.text()
  await $testInfo.attach('response', {                       // request/response in the HTML report
    body: JSON.stringify({ url: res.url(), status: res.status(), headers: res.headers(), body: safeJson(text) }, null, 2),
    contentType: 'application/json',
  })
  expect(res.status(), `Body: ${text}`).toBe(status)
  ctx.body = safeJson(text)
})

Then('the response is a valid paginated players list', async ({ ctx }) => {
  expect(ctx.response!.headers()['content-type']).toContain('application/json')
  const parsed = Paged(Player).safeParse(ctx.body)
  expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues, null, 2)).toBe(true)
})

Then('the response is a problem+json with status {int}', async ({ ctx }, status: number) => {
  expect(ctx.response!.headers()['content-type']).toContain('application/problem+json')
  const p = Problem.parse(ctx.body)
  expect(p.status).toBe(status)
})

Then('the error list contains param {string} with code {string}', async ({ ctx }, param: string, code: string) => {
  expect(Problem.parse(ctx.body).errors).toEqual(expect.arrayContaining([expect.objectContaining({ param, code })]))
})

Then('players are sorted by {string} {string}', async ({ ctx }, field: string, dir: string) => {
  const vals = (ctx.body as any).data.map((p: any) => p[field])
  const sorted = [...vals].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0) * (dir === 'desc' ? -1 : 1))
  expect(vals).toEqual(sorted)
})

const safeJson = (t: string) => { try { return JSON.parse(t) } catch { return t } }
```

Notes:
- In playwright-bdd, `$testInfo` is a built-in step fixture (alongside `$test`, `$tags`, `$step`). `testInfo.attach` puts the payload in the HTML report and in the cucumber reports if they're configured.
- **Shape validation options**:
  - **zod `safeParse`** (recommended): typed, shared with the API, and clear diffs from `issues`. Strict objects catch extra or leaked fields.
  - **ajv + JSON Schema**: language-neutral and works with an OpenAPI spec. Use it if you generate an OpenAPI document and want to validate against the *contract* rather than the implementation's own schema. This is arguably more independent, and worth a sentence in the README.
  - **`toMatchObject`** / `expect.objectContaining`: good for specific values, weak for full shape.
  - Use zod for shape plus explicit `expect` for business values (counts, ids, ordering).
- **Assert behaviour, not just shape.** Filter steps check *every* row matches. Sort steps compare to a locally sorted copy. Pagination checks `data.length <= limit`, `totalPages === ceil(total/limit)`, and that pages 1 and 2 don't overlap.
- **Independence**: the API is read-only, the `request` context is per test, the `ctx` fixture is per scenario, there is no ordering between scenarios, and `fullyParallel: true`. Don't hard-code `total` from a different scenario. You may import the JSON dataset in tests to compute expected counts as an oracle (e.g. `players.filter(p => p.teamId==='MI').length`). This is fine for a mock API, and the README should say it's a deliberate test oracle.
- **Tags**: `@api`, `@smoke`, `@negative` for `--grep`. `bddgen` must run before `playwright test`, which the `test:api` script already does.

### 3.5 Env config

`config/env.ts` reads `ENV` (`local` default) and loads `.env.local` / `.env.ci` through `dotenv`, exporting `{ apiBaseUrl, apiPort, startLocalApi }`. Commit `.env.example`. Nothing secret is needed. Keep the same pattern as the UI suite's `baseURL` handling so the two look consistent.

---

## 4. Unit tests for the API (optional, recommended light)

- **vitest 5.0.3** with Hono's `app.request()`, no server and no port: `const res = await app.request('/api/players?limit=0'); expect(res.status).toBe(400)`.
- Also unit-test the pure `repo.ts` functions (filter, sort stability, pagination math).
- Keep it small (about 10 tests) to show layering: unit tests check the logic, and the Playwright BDD tests check the HTTP contract end to end. Add a script: `"test:unit": "vitest run"`.

Source: https://hono.dev/docs/guides/testing

---

## 5. README points for the reviewer

- `npm ci && npx playwright install` (not needed for API-only), then `npm run api:start` to run the API, or `npm run test:api`, which auto-starts it through `webServer`.
- A short endpoint table and query-param table with defaults and limits, plus example curl lines.
- Design decisions: 400 vs 422, strict unknown params, no clamping, empty page returns 200, RFC 9457 errors.

---

## 6. Section A3 note: JSONPlaceholder POST behaviour (real responses, 2026-10-05)

`curl -X POST https://jsonplaceholder.typicode.com/posts`:

| Case | Request body | Status | Response body |
|---|---|---|---|
| Normal | `{"title":"foo","body":"bar","userId":1}` + `Content-Type: application/json; charset=UTF-8` | **201** | `{"title":"foo","body":"bar","userId":1,"id":101}` |
| 5000-char title | `title: "AAAA…"(5000)` | **201** | echoes the full title, `id:101` |
| Special chars (UTF-8 file) | `{"title":"ü 日本 😀 <b>&amp;","userId":1}` | **201** | echoed unchanged: `{ title: 'ü 日本 😀 <b>&amp;', userId: 1, id: 101 }` (no escaping or sanitising) |
| Script/SQL payload | `"<script>alert(1)</script> '; DROP TABLE posts;--"` | **201** | echoed as is |
| Missing userId | `{"title":"t","body":"b"}` | **201** | `{"title":"t","body":"b","id":101}` (no validation) |
| Empty object | `{}` | **201** | `{"id":101}` |
| Wrong types | `{"title":123,"userId":"abc"}` | **201** | echoed with the wrong types |
| Malformed JSON | `{bad` | **500** | HTML/text **stack trace** from body-parser: `SyntaxError: Expected property name or '}' in JSON at position 1 ... /app/node_modules/body-parser/...` (should be 400, and it leaks internals) |
| No Content-Type | `-d '{"title":"t","userId":1}'` (form-encoded by curl) | **201** | `{"{\"title\":\"t\",\"userId\":1}":"","id":101}` (body parsed as a form key) |
| Persistence | `GET /posts/101` afterwards | **404** | nothing is stored |
| `PUT /posts/1` `{"title":"x"}` | | 200 | `{"title":"x","id":1}` (full replace semantics, fake) |
| `PUT /posts/999` | | **500** | stack trace (non-existent id) |
| `DELETE /posts/999` | | **200** | `{}` (deleting a non-existent resource "succeeds") |
| `GET /posts/0`, `/posts/abc`, `/posts/999` | | 404 | `{}` |
| `GET /posts?_page=1&_limit=3` | | 200 | headers `x-total-count: 100`, `Link: <...>; rel="first", rel="next", rel="last"` (json-server conventions) |

Takeaway for A3: JSONPlaceholder is a **fake echo service**. Every POST returns 201 with `id: 101`, with no validation and no persistence. Tests against it can only assert the *echo contract* (status 201, body = sent fields + `id`). They can't assert validation. Report the findings as "would be bugs on a real API": no 400 for missing/invalid fields, a 500 with a stack trace on malformed JSON, 200 on DELETE of a missing id, and a 500 on PUT of a missing id. The API built in Section B fixes exactly these issues, which makes a nice link between the two sections.

Note on Windows shells: passing non-ASCII characters inline in `curl -d` from Git Bash mangled them (`� ?? ??`). Sending a UTF-8 file with `--data-binary @file.json` round-tripped correctly. Playwright's `request.post(url, { data })` serialises to UTF-8 JSON, so it doesn't have this problem.

Source: https://jsonplaceholder.typicode.com/guide/ ("resource will not be really updated on the server but it will be faked as if")

---

## 7. Sources

- Playwright API testing: https://playwright.dev/docs/api-testing
- Playwright webServer: https://playwright.dev/docs/test-webserver
- APIRequestContext: https://playwright.dev/docs/api/class-apirequestcontext
- playwright-bdd docs (createBdd, fixtures, `$testInfo`, DataTable): https://vitalets.github.io/playwright-bdd/ and https://github.com/vitalets/playwright-bdd/blob/main/docs/writing-steps/playwright-style.md
- Hono validation: https://hono.dev/docs/guides/validation · testing: https://hono.dev/docs/guides/testing
- @hono/zod-validator source (default `c.json(result, 400)`): https://github.com/honojs/middleware/blob/main/packages/zod-validator/src/index.ts
- Hono validator query handling (repeated key turns into an array): https://github.com/honojs/hono/blob/main/src/validator/validator.ts
- Express 5 migration (read-only `req.query`, `simple` parser, async errors, Node 18+): https://expressjs.com/en/guide/migrating-5.html
- Fastify validation: https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
- RFC 9457 Problem Details: https://www.rfc-editor.org/rfc/rfc9457.html
- RFC 9110 (400/404/405/422 semantics): https://www.rfc-editor.org/rfc/rfc9110.html
- JSON:API sorting convention: https://jsonapi.org/format/#fetching-sorting
- zod 4 API (coerce, stringbool, strictObject): https://zod.dev/api
- JSONPlaceholder guide: https://jsonplaceholder.typicode.com/guide/
