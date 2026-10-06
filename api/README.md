# IPL stats API (Section B1)

A small read-only REST API over JSON files ([data/](data/README.md)), built with
[Hono](https://hono.dev) and [zod](https://zod.dev). No database connection.

> The data is **illustrative IPL-2024-style sample data, not official statistics** (real team and
> player names, approximate figures). See [data/README.md](data/README.md).

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
- **Pagination:** `page` 1–10000 (default 1), `limit` 1–100 (default 10). `limit=101` is **rejected**, not silently clamped. A page past the end is a valid request and returns `200` with `data: []`.
- **Search:** `q` is a case-insensitive substring match on the player name, 2–50 characters after trimming.
- **Unknown parameters are rejected** on every endpoint, including those that take none (`/health`, `/api/players/:id`) (`400`, code `unknown_parameter`). A misspelt filter (`tem=MI`) would otherwise silently return unfiltered data. Many public APIs ignore unknown parameters for forward compatibility; this one prefers strictness.
- **Integers must be plain digits:** `limit=`, `limit=1e2`, `limit=1.5`, `limit=-1` and a repeated `limit=1&limit=2` are all `400`. Leading zeros are accepted (`limit=010` is 10).
- **Enum values are case-sensitive and upper-case** (`team=MI`, `role=BOWLER`); `team=mi` is `400`. Parameter names are case-sensitive too (`TEAM=MI` is an unknown parameter).
- **Repeating a sort key** (`sort=-runs,-runs`) is accepted and has no extra effect.
- **Methods:** `GET` (and `HEAD`, which Hono serves for every GET route). Other methods on a known path return `405` with `Allow: GET, HEAD`. A trailing slash (`/api/players/`) is a different, unknown route (`404`).
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

This matrix is the test plan for B2: every row is covered by the scenario named in the last column
(feature files in `features/api/`).

| Endpoint            | Request                                                                         | Status                                                   | Covered by                                                                         |
| ------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| health              | `GET /health`                                                                   | 200                                                      | routing-and-errors: _Health check_                                                 |
| health, players/:id | unknown param (`?foo=1`)                                                        | 400 `foo`/`unknown_parameter`                            | routing-and-errors: _Endpoints without query parameters still reject unknown ones_ |
| any                 | unknown route `GET /api/nope`                                                   | 404                                                      | routing-and-errors: _Unknown route_                                                |
| any                 | `POST`/`PUT`/`DELETE`/`PATCH` on a known path                                   | 405 + `Allow: GET, HEAD`                                 | routing-and-errors: _Unsupported methods…_ (5 rows)                                |
| teams               | no params                                                                       | 200 (10 teams)                                           | teams: _List all teams_                                                            |
| teams               | `sort=name`                                                                     | 200                                                      | teams: _Sort teams by name_                                                        |
| teams               | `sort=-titles,name` (multi-key)                                                 | 200                                                      | teams: _Sort teams by titles (descending), then by name_                           |
| teams               | `sort=city`                                                                     | 400 `sort`/`invalid`                                     | teams: _An unsortable field is rejected_                                           |
| players             | defaults (page 1, limit 10, total 36)                                           | 200                                                      | players: _Default pagination_                                                      |
| players             | `team`, `role`, `q` (case-insensitive), `minRuns`, `maxRuns`                    | 200                                                      | players: _Filter and search_ (6 rows)                                              |
| players             | `team` + `role` + `minRuns` + `sort` combined                                   | 200                                                      | players: _Combined filters, sorting and a run range_                               |
| players             | `sort` on every field, both directions                                          | 200                                                      | players: _Sorting by…_ (10 rows)                                                   |
| players             | multi-key sort tie-break (`-runs,name` / `-runs,-name`)                         | 200                                                      | players: _Multi-key sort breaks ties…_ (2 rows)                                    |
| players             | `page` + `limit`                                                                | 200                                                      | players: _Second page and page size_                                               |
| players             | page past the end (`page=99`)                                                   | 200, empty `data`                                        | players: _A page past the end is valid and empty_                                  |
| players             | `limit` = `0`, `101`, `abc`, `1e2`, empty, repeated                             | 400 `limit`/`invalid`                                    | players: _Invalid query parameters_ (6 rows)                                       |
| players             | `page` = `0`, `1.5`                                                             | 400 `page`/`invalid`                                     | players: _Invalid query parameters_                                                |
| players             | `team=XYZ`, `role=CAPTAIN`, `q=a`, `minRuns=-5`, `minRuns>maxRuns`, `sort=age`  | 400 `invalid`                                            | players: _Invalid query parameters_                                                |
| players             | unknown `foo=1`, misspelt `tem=MI`                                              | 400 `unknown_parameter`                                  | players: _Invalid query parameters_                                                |
| players             | invalid `minRuns` with a valid `maxRuns`                                        | 400, one error only (no follow-on range error)           | players: _An invalid run bound gets one error…_                                    |
| players             | several invalid params at once                                                  | 400, all listed                                          | players: _Every invalid parameter is reported at once_                             |
| players/:id         | `1`                                                                             | 200                                                      | players: _Get one player by id_                                                    |
| players/:id         | `999` (well-formed, absent)                                                     | 404                                                      | players: _Player id … returns …_                                                   |
| players/:id         | `abc`, `0`, `-1`                                                                | 400                                                      | players: _Player id … returns …_                                                   |
| matches             | **no `season`**                                                                 | 400 `season`/`missing`                                   | matches: _The season parameter is required_ (and Examples row `limit=5`)           |
| matches             | `season=2024`                                                                   | 200 (24 matches)                                         | matches: _All matches of a season_                                                 |
| matches             | `season=2023` (valid, no data)                                                  | 200, empty `data`                                        | matches: _A valid season without data returns an empty list_                       |
| matches             | `team`, `stage`, `from`, `to`                                                   | 200                                                      | matches: _Filter matches_ (5 rows)                                                 |
| matches             | `sort=date` + `page` + `limit`                                                  | 200                                                      | matches: _Paging through a season in date order_                                   |
| matches             | `sort=-id`                                                                      | 200                                                      | matches: _Sort by id, descending_                                                  |
| matches             | `team` + `from` + `to` + `sort=-date` combined                                  | 200                                                      | matches: _Date window, team and sort combined_                                     |
| matches             | `season` = `abc`, `2007`, `2030`                                                | 400 `season`/`invalid`                                   | matches: _Invalid match queries_                                                   |
| matches             | `stage=SEMI_FINAL`, `from>to`, `from=2024-02-30`, `to=26-05-2024`, `sort=venue` | 400 `invalid`                                            | matches: _Invalid match queries_                                                   |
| matches             | unknown `year=2024`                                                             | 400 `unknown_parameter`                                  | matches: _Invalid match queries_                                                   |
| matches             | malformed `from` with a valid `to`                                              | 400, one error only (no follow-on calendar/range errors) | matches: _A malformed date gets one error…_                                        |
