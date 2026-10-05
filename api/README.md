# IPL stats API (Section B1)

A small read-only REST API over JSON files ([data/](data/README.md)), built with
[Hono](https://hono.dev) and [zod](https://zod.dev). No database connection.

```bash
npm run api:start          # http://localhost:3000 (port from API_PORT)
npm run api:dev            # same, with reload on change
```

Playwright starts the API automatically for the `api` test project (`webServer` in
`playwright.config.ts`), so you never have to start it by hand to run the tests.

## Endpoints

| Method + path          | Purpose                                           | Query parameters                                                                                                        |
| ---------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /health`          | Liveness probe (used by Playwright's `webServer`) | none                                                                                                                    |
| `GET /api/teams`       | All 10 teams                                      | `sort` (`name`, `titles`)                                                                                               |
| `GET /api/players`     | Paginated player list                             | `page`, `limit`, `sort` (`name`, `runs`, `wickets`, `matches`, `strikeRate`), `team`, `role`, `q`, `minRuns`, `maxRuns` |
| `GET /api/players/:id` | One player                                        | path `id` (positive integer)                                                                                            |
| `GET /api/matches`     | Paginated matches of one season                   | **`season` (required)**, `page`, `limit`, `sort` (`date`, `id`), `team` (home or away), `stage`, `from`, `to`           |

List responses: `{ "data": [...], "meta": { "page", "limit", "total", "totalPages" } }`
(`/api/teams` is not paginated: `{ "data": [...] }`).

## Conventions (deliberate choices)

- **Sorting:** `sort=-runs,name`. Comma-separated, whitelisted fields; a `-` prefix means descending. Text sorts alphabetically, ignoring case; numbers sort numerically. The sort is stable, with `id` as the final tie-breaker.
- **Pagination:** `page` ≥ 1 (default 1), `limit` 1–100 (default 10). `limit=101` is **rejected**, not silently clamped. A page past the end is a valid request and returns `200` with `data: []`.
- **Search:** `q` is a case-insensitive substring match on the player name, 2–50 characters after trimming.
- **Unknown parameters are rejected** (`400`, code `unknown_parameter`). A misspelt filter (`tem=MI`) would otherwise silently return unfiltered data. Many public APIs ignore unknown parameters for forward compatibility; this one prefers strictness.
- **Integers must be plain digits:** `limit=`, `limit=1e2`, `limit=1.5`, `limit=-1` and a repeated `limit=1&limit=2` are all `400`.
- **Season range** is 2008 (first IPL season) to 2024 (latest season served). A season in range with no loaded data (e.g. 2023) is valid and returns `200` with an empty list.
- **`400`, not `422`,** for invalid query/path parameters (they are problems with the request target). `422` would be used for request bodies, which this read-only API does not accept.

## Errors: RFC 9457 Problem Details

Every error is `application/problem+json`:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Invalid query parameter(s)",
  "instance": "/api/matches",
  "errors": [{ "param": "season", "code": "missing", "message": "season is required" }]
}
```

`errors[].code` is one of `missing`, `unknown_parameter`, `invalid`. All messages are written by
this API (not zod defaults), so clients can rely on them. A `500` never exposes internals.

## Status code and parameter matrix

This matrix is the test plan for B2: each row maps to a scenario or an Examples row in
`features/api/`.

| Endpoint    | Request                                                                            | Status             | Error `param` / `code`      |
| ----------- | ---------------------------------------------------------------------------------- | ------------------ | --------------------------- |
| any         | `GET /health`                                                                      | 200                |                             |
| any         | unknown route `GET /api/nope`                                                      | 404                |                             |
| any         | `POST`/`PUT`/`DELETE` on a known path                                              | 405 + `Allow: GET` |                             |
| teams       | no params; `sort=name`; `sort=-titles,name`                                        | 200                |                             |
| teams       | `sort=city`                                                                        | 400                | `sort` / `invalid`          |
| players     | defaults (page 1, limit 10, total 36)                                              | 200                |                             |
| players     | `team`, `role`, `q`, `minRuns`/`maxRuns`, `sort`, `page`/`limit`, and combinations | 200                |                             |
| players     | page past the end (`page=99`)                                                      | 200, empty `data`  |                             |
| players     | `limit=0`, `limit=101`, `limit=abc`, `limit=1e2`, `limit=`, `limit=1&limit=2`      | 400                | `limit` / `invalid`         |
| players     | `page=0`, `page=1.5`                                                               | 400                | `page` / `invalid`          |
| players     | `team=XYZ`, `role=CAPTAIN`                                                         | 400                | `team` / `role` / `invalid` |
| players     | `q=a` (too short)                                                                  | 400                | `q` / `invalid`             |
| players     | `minRuns=500&maxRuns=100`                                                          | 400                | `minRuns` / `invalid`       |
| players     | `sort=age` (not sortable)                                                          | 400                | `sort` / `invalid`          |
| players     | `foo=1` (unknown)                                                                  | 400                | `foo` / `unknown_parameter` |
| players/:id | `1`                                                                                | 200                |                             |
| players/:id | `999` (well-formed, absent)                                                        | 404                |                             |
| players/:id | `abc`, `0`                                                                         | 400                | `id` / `invalid`            |
| matches     | `season=2024` with `team`, `stage`, `from`/`to`, `sort`, paging                    | 200                |                             |
| matches     | `season=2023` (valid, no data)                                                     | 200, empty `data`  |                             |
| matches     | **no `season`**                                                                    | 400                | `season` / `missing`        |
| matches     | `season=abc`, `season=2007`, `season=2030`                                         | 400                | `season` / `invalid`        |
| matches     | `from=2024-05-30&to=2024-05-01`                                                    | 400                | `from` / `invalid`          |
| matches     | `from=2024-02-30` (not a real date)                                                | 400                | `from` / `invalid`          |
