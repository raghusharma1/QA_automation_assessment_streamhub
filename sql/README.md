# SQL scenarios (Section B4)

Both scenarios are written in the **PostgreSQL** dialect. They run with **no installation** on
[PGlite](https://pglite.dev) (the real PostgreSQL engine compiled to WebAssembly), from a Playwright
test project that asserts the expected rows and saves the result tables as screenshots:

```bash
npm run test:sql        # run both scenarios and assert the expected rows
npm run sql:evidence    # same, and (re)write the screenshots + raw outputs in sql/results/
```

Every `.sql` file also runs unchanged in any PostgreSQL 14+ client (psql, DB Fiddle, pgAdmin):
run `schema.sql`, then `seed.sql`, then a query.

| Scenario                | Folder (schema, seed, queries)                  | Results: screenshot (raw text)                                                                                                                                                                                                                                                                           |
| ----------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Round-trip transfers | [scenario1-round-trips/](scenario1-round-trips) | [all pairs](results/scenario1-round-trips.png) ([txt](results/scenario1-round-trips.txt)) · [one-to-one](results/scenario1-round-trips-one-to-one.png) ([txt](results/scenario1-round-trips-one-to-one.txt))                                                                                             |
| 2. IPL 30+ run streaks  | [scenario2-streaks/](scenario2-streaks)         | [primary](results/scenario2-streaks.png) ([txt](results/scenario2-streaks.txt)) · [LAG/LEAD](results/scenario2-streaks-lag-lead.png) ([txt](results/scenario2-streaks-lag-lead.txt)) · [team fixtures](results/scenario2-streaks-team-fixtures.png) ([txt](results/scenario2-streaks-team-fixtures.txt)) |

The expected rows in `tests/sql/*.spec.ts` were worked out by hand from the seed data **before** the
queries were run. They are never generated from the queries themselves.

---

## Scenario 1: round-trip transfers

> Find instances where Account A sends money to Account B, and Account B sends a similar amount
> (within 10%) back to Account A, both within a 24-hour window.

### Definitions

| Rule                 | Decision                                                                                                                           | SQL                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Direction            | The return goes the opposite way between the same two accounts                                                                     | `r.from_account = o.to_account AND r.to_account = o.from_account`                    |
| "Within 10%"         | Relative to the **original** amount, **inclusive** (±10.00% matches, 10.01% does not)                                              | `ABS(r.amount - o.amount) <= 0.10 * o.amount`                                        |
| "Within 24 hours"    | The return is **strictly after** the original and **at most exactly 24h** later                                                    | `r.created_at > o.created_at AND r.created_at <= o.created_at + INTERVAL '24 hours'` |
| Self-transfers (A→A) | Excluded: not a transfer between two parties                                                                                       | `o.from_account <> o.to_account`                                                     |
| Who is "A"           | The account that moved money first. B→A then A→B is one round trip started by B, reported **once**                                 | follows from the strict `>`                                                          |
| A→B→C→A              | Not a direct return; not reported                                                                                                  |                                                                                      |
| Several candidates   | The main query lists **every** qualifying pair (best for an investigator). A one-to-one variant uses each transaction at most once | `query-one-to-one.sql`                                                               |

Money is `NUMERIC(14,2)` (exact decimal), so the 10% boundary is not subject to floating-point error.

### Edge cases in the seed (expected result worked out by hand)

| Case                         | Txns       | Expected                                 |
| ---------------------------- | ---------- | ---------------------------------------- |
| E1 basic: −5%, 6h30m         | 1, 2       | match                                    |
| E2 exactly +10.00%           | 3, 4       | match (inclusive)                        |
| E3 +10.01%                   | 5, 6       | no match                                 |
| E4 exactly 24h00m00s         | 7, 8       | match (inclusive)                        |
| E5 24h00m01s                 | 9, 10      | no match                                 |
| E6 B pays first, A pays back | 11, 12     | match **once**, original = 11            |
| E7 two originals, one return | 13, 14, 15 | (13,15) and (14,15); one-to-one: (14,15) |
| E8 one original, two returns | 16, 17, 18 | (16,17) and (16,18); one-to-one: (16,17) |
| E9 self-transfer twice       | 19, 20     | no match                                 |
| E10 A→B→C→A cycle            | 21, 22, 23 | no match                                 |
| E11 exactly −10.00%          | 24, 25     | match (inclusive)                        |
| E12 one-way transfer         | 26         | no match                                 |

---

## Scenario 2: IPL player performance streaks

> Using an IPL-style dataset for the 2024 season, identify players who scored 30+ runs in at least 3
> consecutive matches. Return the player's name and the date the scoring streak commenced.

The players and matches are the **same data the API serves** (`api/data/*.json`, illustrative
IPL-2024-style sample data, not official statistics). `seed.sql` is generated from those files plus
`innings.json` (one row per player per match in which they batted) by `npm run sql:seed`, and a test
fails if the committed `seed.sql` is out of date.

### Definitions

| Rule                                | Decision                                                                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "30+ runs"                          | `runs >= 30`, so exactly 30 counts                                                                                                                                                                                               |
| Season                              | Only 2024 innings are numbered. A 2023 innings can never start or extend a 2024 streak                                                                                                                                           |
| "Consecutive matches" (**primary**) | Consecutive **appearances** of the player: the innings they actually batted in, in date order. A match the player did not bat in neither extends nor breaks a streak (cricket statistics count "N consecutive innings" this way) |
| "Consecutive matches" (alternative) | Consecutive **matches played by the player's team**. A match the team played without this player batting **breaks** the streak. A washed-out fixture with no play (match 19) is not a match played, so it breaks nothing         |
| Long streaks                        | A 5-match streak is reported **once**, as one row with its first date (not three overlapping rows)                                                                                                                               |
| Several streaks                     | A player with two separate streaks gets two rows                                                                                                                                                                                 |
| Extra columns                       | Streak length, end date and total runs are returned as well as name + start date                                                                                                                                                 |

### Technique: gaps and islands

1. Number each player's 2024 innings in date order (`appearance_no`).
2. Keep only the 30+ innings and number them again (`hit_no`).
3. While 30+ scores are consecutive, both numbers rise together, so `appearance_no − hit_no` is
   constant. Every sub-30 innings makes the difference jump, which starts a new "island".
4. Group by player and island: `MIN(date)` is the streak start, `COUNT(*)` its length; keep
   `COUNT(*) >= 3`.

The filter `runs >= 30` must sit **between** the two `ROW_NUMBER()`s. Window functions run after
`WHERE`, so putting both in one `SELECT` would leave no gaps to detect.

| Query                     | Interpretation                  | Technique                                         |
| ------------------------- | ------------------------------- | ------------------------------------------------- |
| `query.sql` (**primary**) | consecutive appearances         | gaps and islands (`ROW_NUMBER` difference)        |
| `query-lag-lead.sql`      | consecutive appearances         | `LAG`/`LEAD` look-around (name + start date only) |
| `query-team-fixtures.sql` | consecutive team matches played | gaps and islands over the team's fixture numbers  |

### Edge cases in the seed (expected result worked out by hand)

| Player (team)         | 2024 innings, in order                                        | Primary                           | Team fixtures | Why                                                                   |
| --------------------- | ------------------------------------------------------------- | --------------------------------- | ------------- | --------------------------------------------------------------------- |
| Virat Kohli (RCB)     | 45, **30**, 77, 52, 61, 12, 33 (+ a 2023 century just before) | 1 row: from 2024-03-22, 5 matches | same          | exactly 30 counts; a 5-streak is one row; the 2023 innings is ignored |
| Faf du Plessis (RCB)  | 35, 31, 62, 9, 44, 54, 40                                     | 2 rows: 2024-03-22 and 2024-04-28 | same          | two separate streaks                                                  |
| Ruturaj Gaikwad (CSK) | 15, 108, 62, 42, 0                                            | 1 row: from 2024-04-23, exactly 3 | same          | minimum length                                                        |
| Sanju Samson (RR)     | 82, 38, **29**, 47, 33                                        | none                              | none          | 29 breaks what would be a 5-match streak                              |
| Travis Head (SRH)     | 62, 89, 25, 102, 34, 0                                        | none                              | none          | two streaks of 2 are not enough                                       |
| Andre Russell (KKR)   | 64, 41, _did not bat_, 37, 35                                 | 1 row: from 2024-03-23, 4 matches | **none**      | the case that separates the two interpretations                       |
| Sunil Narine (KKR)    | 2, 85, 10, 81, _(match 19 washed out)_, 39, 31                | 1 row: from 2024-05-05, 3 matches | same          | a fixture with no play does not break a streak                        |

### Indexes

`batting_scores (player_id, match_id)` and `matches (season, match_date)` serve the window
partitions and the season filter. Scenario 1's self-join is served by
`transactions (from_account, to_account, created_at)`: equality on the pair, range on the time.
