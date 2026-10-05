# 05 - SQL Scenarios: Round-trip Transfers and IPL Batting Streaks

> Research date: 2026-10-05. Every query below was **executed** against the seed data on
> **PostgreSQL 18.3** (via PGlite, real Postgres compiled to WASM, running in Node 22) and **SQLite 3.49/3.50**
> (Python/Node built-in + `sqlite3` CLI). All 10 engine x query assertions pass (see section 6).

## Contents
1. Engine choice
2. Scenario 1 - Round-trip transfers (schema, seed, definitions, query, output, indexes)
3. Scenario 2 - IPL 30+ streaks (schema, seed, gaps-and-islands explained, queries, output)
4. Dialect notes (PostgreSQL vs SQLite vs MySQL)
5. How to produce the screenshots
6. Automated verification (Node runner with assertions + HTML report)
7. Talking points for the interview

---

## 1. Engine choice

**Recommendation: present the solution in PostgreSQL; keep it runnable in SQLite.**

| Criterion | PostgreSQL | SQLite |
|---|---|---|
| Window functions (`ROW_NUMBER`, `LAG`, `LEAD`, `WINDOW` clause) | Full | Yes (>= 3.25; `WINDOW` clause >= 3.28) |
| Interval arithmetic | Native: `ts + INTERVAL '24 hours'`, `ts2 - ts1` returns `interval` | No interval type: `datetime(ts, '+24 hours')`, `strftime('%s', ...)` |
| Exact money arithmetic | `NUMERIC(14,2)` is exact decimal | `NUMERIC` affinity stores REAL/INTEGER (binary float) - fine for the seed values, not for production money |
| Real types (`DATE`, `TIMESTAMP`, `BOOLEAN`) | Enforced | Stored as TEXT/INTEGER, no enforcement |
| Reviewer reproducibility | db-fiddle / OneCompiler / Docker one-liner | Zero install (any online compiler, Python) |
| "Looks like production" to a reviewer | Yes | Less |

Why PG for the write-up: the 24-hour window and time gap read naturally (`INTERVAL`), money is exact,
and reviewers of a QA/data assessment expect a server dialect. Why keep SQLite: a reviewer with nothing
installed can paste into any online SQLite compiler. **Scenario 2 SQL is 100% portable (identical text
on both). Scenario 1 differs in exactly two expressions** (the 24h window and the time-gap display), so
both dialect versions are given.

Local environment found on this machine: `sqlite3` 3.50.6 CLI, Python 3.12 (sqlite 3.49.1), Node 22.14
(`node:sqlite` behind `--experimental-sqlite`), Docker 29 installed but the daemon was not running,
no `psql`. PostgreSQL was therefore verified with `@electric-sql/pglite` (npm), which is the genuine
Postgres engine (it reported `PostgreSQL 18.3`).

---

## 2. Scenario 1 - Round-trip transfers / quick reversals

> Find instances where Account A sends money to Account B, and Account B sends a similar amount
> (within 10%) back to Account A, within a 24-hour window.

### 2.1 Precise definitions (decide and state them - reviewers look for this)

| Rule | Decision | Predicate |
|---|---|---|
| Direction | Return goes the opposite way between the same two accounts | `r.from_account = o.to_account AND r.to_account = o.from_account` |
| "Within 10%" | Relative to the **original** amount, **inclusive** | `ABS(r.amount - o.amount) <= 0.10 * o.amount` |
| "Within 24h" | Return **strictly after** the original and **at most 24h00m00s** later (inclusive) | `r.created_at > o.created_at AND r.created_at <= o.created_at + INTERVAL '24 hours'` |
| Self-transfers (A->A) | Excluded - not a transfer between two parties | `o.from_account <> o.to_account` |
| Reverse before forward | The earlier txn is always the "original". B->A then A->B is a round trip **initiated by B** and is reported **once**, with B as `account_a`. It is never reported twice, because the time predicate is strict and one-directional. | (falls out of `r.created_at > o.created_at`) |
| Mirror duplicates | Impossible: a pair (x,y) can only appear as (original=x, return=y) when x is earlier | strict `>` |
| Many-to-one / one-to-many | The main query lists **all** candidate pairs (best for an investigator). A dedup variant produces one-to-one matches. | see 2.6 |
| A->B->C->A | Not a direct return; not reported (would need a 3-hop query) | - |

**Alternatives for "within 10%" (mention in the interview):**

* Relative to the original (chosen): `|r-o| <= 0.10*o`. Asymmetric: 100 -> 110 passes, 110 -> 100 passes
  too (|−10| <= 11), but 100 -> 90 passes while 90 -> 100 does not (10 > 9). It matches the wording
  "B sends a similar amount back" - the original is the reference.
* Relative to the larger amount: `|r-o| <= 0.10*GREATEST(o,r)` - symmetric, slightly more lenient.
* Relative to the smaller amount: `|r-o| <= 0.10*LEAST(o,r)` - symmetric, strictest.
* Ratio form: `r BETWEEN 0.90*o AND 1.10*o` - identical to the chosen rule, often more readable/indexable.
* Integer-safe form for float engines: `ABS(r-o)*10 <= o` (avoids `0.1` binary rounding). Best of all,
  store money as integer minor units (`amount_paise BIGINT`) or `NUMERIC`.

**Timestamps:** use `TIMESTAMPTZ` (UTC) in production so "24 hours" is unambiguous across DST/time zones.
The seed uses plain `TIMESTAMP` for portability.

### 2.2 Schema (`schema.sql`)

```sql
-- Scenario 1 schema (portable: PostgreSQL + SQLite)
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS accounts;

CREATE TABLE accounts (
    account_id   VARCHAR(10)  PRIMARY KEY,
    holder_name  VARCHAR(100) NOT NULL,
    opened_at    TIMESTAMP    NOT NULL
);

CREATE TABLE transactions (
    txn_id        INTEGER        PRIMARY KEY,
    from_account  VARCHAR(10)    NOT NULL REFERENCES accounts(account_id),
    to_account    VARCHAR(10)    NOT NULL REFERENCES accounts(account_id),
    amount        NUMERIC(14,2)  NOT NULL CHECK (amount > 0),
    created_at    TIMESTAMP      NOT NULL
    -- Deliberately no CHECK (from_account <> to_account): self-transfers exist in
    -- real ledgers (sweeps, test txns) and the query must be robust to them.
);

-- Serves the self-join probe:
--   r.from_account = o.to_account AND r.to_account = o.from_account
--   AND r.created_at BETWEEN o.created_at AND o.created_at + 24h
CREATE INDEX ix_txn_pair_time ON transactions (from_account, to_account, created_at);
```

### 2.3 Seed data with deliberate edge cases (`seed.sql`)

```sql
INSERT INTO accounts (account_id, holder_name, opened_at) VALUES
('ACC001','Aarav Mehta','2023-01-10 10:00:00'),
('ACC002','Bhavna Rao','2023-02-11 10:00:00'),
('ACC003','Chirag Shah','2023-03-12 10:00:00'),
('ACC004','Divya Nair','2023-04-13 10:00:00'),
('ACC005','Esha Kapoor','2023-05-14 10:00:00'),
('ACC006','Farhan Ali','2023-06-15 10:00:00'),
('ACC007','Gauri Iyer','2023-07-16 10:00:00'),
('ACC008','Harsh Verma','2023-08-17 10:00:00'),
('ACC009','Isha Gupta','2023-09-18 10:00:00'),
('ACC010','Jay Patel','2023-10-19 10:00:00'),
('ACC011','Kavya Menon','2023-11-20 10:00:00'),
('ACC012','Lakshay Jain','2023-12-21 10:00:00');

INSERT INTO transactions (txn_id, from_account, to_account, amount, created_at) VALUES
-- E1  basic round trip, -5%, 6h30m                        -> MATCH (1,2)
( 1,'ACC001','ACC002',1000.00,'2024-03-01 09:00:00'),
( 2,'ACC002','ACC001', 950.00,'2024-03-01 15:30:00'),
-- E2  exactly +10.00%                                     -> MATCH (3,4)
( 3,'ACC003','ACC004', 100.00,'2024-03-02 10:00:00'),
( 4,'ACC004','ACC003', 110.00,'2024-03-02 12:00:00'),
-- E3  +10.01% (just outside tolerance)                    -> NO MATCH
( 5,'ACC005','ACC006', 100.00,'2024-03-03 10:00:00'),
( 6,'ACC006','ACC005', 110.01,'2024-03-03 11:00:00'),
-- E4  gap exactly 24h00m00s                               -> MATCH (7,8)
( 7,'ACC007','ACC008', 500.00,'2024-03-04 08:00:00'),
( 8,'ACC008','ACC007', 500.00,'2024-03-05 08:00:00'),
-- E5  gap 24h00m01s                                       -> NO MATCH
( 9,'ACC009','ACC010', 750.00,'2024-03-06 08:00:00'),
(10,'ACC010','ACC009', 750.00,'2024-03-07 08:00:01'),
-- E6  "reverse before forward": ACC012 pays first, ACC011 pays back
--     -> reported ONCE, the earlier txn (11) is the original
(11,'ACC012','ACC011', 300.00,'2024-03-08 07:00:00'),
(12,'ACC011','ACC012', 300.00,'2024-03-08 09:00:00'),
-- E7  same pair: two originals, one return (many-to-one)
--     -> raw: (13,15),(14,15); deduped: (14,15)
(13,'ACC001','ACC002',2000.00,'2024-03-10 10:00:00'),
(14,'ACC001','ACC002',2000.00,'2024-03-10 11:00:00'),
(15,'ACC002','ACC001',1900.00,'2024-03-10 18:00:00'),
-- E8  one original, two returns (one-to-many)
--     -> raw: (16,17),(16,18); deduped: (16,17)
(16,'ACC003','ACC004', 400.00,'2024-03-11 09:00:00'),
(17,'ACC004','ACC003', 400.00,'2024-03-11 10:00:00'),
(18,'ACC004','ACC003', 380.00,'2024-03-11 12:00:00'),
-- E9  self-transfers A->A twice                           -> NO MATCH
(19,'ACC005','ACC005', 200.00,'2024-03-12 09:00:00'),
(20,'ACC005','ACC005', 200.00,'2024-03-12 10:00:00'),
-- E10 A->B->C->A via a third party (cycle, not a direct return) -> NO MATCH
(21,'ACC006','ACC007', 600.00,'2024-03-13 09:00:00'),
(22,'ACC007','ACC008', 600.00,'2024-03-13 10:00:00'),
(23,'ACC008','ACC006', 600.00,'2024-03-13 11:00:00'),
-- E11 exactly -10.00% (lower bound)                       -> MATCH (24,25)
(24,'ACC009','ACC011', 250.00,'2024-03-14 09:00:00'),
(25,'ACC011','ACC009', 225.00,'2024-03-14 09:30:00'),
-- E12 one-way transfer, never returned                    -> NO MATCH
(26,'ACC010','ACC012', 999.00,'2024-03-15 09:00:00');
```

Expected result (worked out by hand **before** running the query):

| Case | Txns | Expected | Why |
|---|---|---|---|
| E1 basic | 1,2 | match | -5%, 6h30m |
| E2 exactly +10% | 3,4 | match | inclusive `<=` |
| E3 +10.01% | 5,6 | no | 10.01 > 10.00 |
| E4 exactly 24h | 7,8 | match | inclusive `<=` |
| E5 24h + 1s | 9,10 | no | outside window |
| E6 reverse before forward | 11,12 | match **once**, original = 11 (ACC012) | earlier txn is the original |
| E7 two originals, one return | 13,14,15 | (13,15) and (14,15); dedup -> (14,15) | many-to-one |
| E8 one original, two returns | 16,17,18 | (16,17) and (16,18); dedup -> (16,17) | one-to-many |
| E9 self-transfer twice | 19,20 | no | `from <> to` filter (without it 19->20 would falsely match) |
| E10 A->B->C->A | 21,22,23 | no | not a direct return |
| E11 exactly -10% | 24,25 | match | lower bound |
| E12 one-way | 26 | no | no return |

### 2.4 Query - PostgreSQL (primary)

```sql
-- Scenario 1 (PostgreSQL dialect): all qualifying (original, return) pairs
SELECT
    o.txn_id                                           AS original_txn_id,
    o.from_account                                     AS account_a,
    o.to_account                                       AS account_b,
    o.amount                                           AS original_amount,
    o.created_at                                       AS original_at,
    r.txn_id                                           AS return_txn_id,
    r.amount                                           AS return_amount,
    r.created_at                                       AS return_at,
    ROUND(100.0 * (r.amount - o.amount) / o.amount, 2) AS pct_diff,
    r.created_at - o.created_at                        AS time_gap      -- INTERVAL
FROM transactions o
JOIN transactions r
  ON  r.from_account = o.to_account                          -- B pays ...
  AND r.to_account   = o.from_account                        -- ... back to A
  AND r.created_at   >  o.created_at                         -- return strictly after original
  AND r.created_at   <= o.created_at + INTERVAL '24 hours'   -- inclusive 24h window
WHERE o.from_account <> o.to_account                         -- ignore self-transfers
  AND ABS(r.amount - o.amount) <= 0.10 * o.amount            -- within 10% of ORIGINAL
ORDER BY o.created_at, r.created_at;
```

### 2.5 Query - SQLite dialect

```sql
-- Scenario 1 (SQLite dialect): all qualifying (original, return) pairs
SELECT
    o.txn_id                                           AS original_txn_id,
    o.from_account                                     AS account_a,
    o.to_account                                       AS account_b,
    o.amount                                           AS original_amount,
    o.created_at                                       AS original_at,
    r.txn_id                                           AS return_txn_id,
    r.amount                                           AS return_amount,
    r.created_at                                       AS return_at,
    ROUND(100.0 * (r.amount - o.amount) / o.amount, 2) AS pct_diff,
    printf('%02d:%02d:%02d',
        (strftime('%s', r.created_at) - strftime('%s', o.created_at)) / 3600,
        (strftime('%s', r.created_at) - strftime('%s', o.created_at)) % 3600 / 60,
        (strftime('%s', r.created_at) - strftime('%s', o.created_at)) % 60) AS time_gap
FROM transactions o
JOIN transactions r
  ON  r.from_account = o.to_account                          -- B pays ...
  AND r.to_account   = o.from_account                        -- ... back to A
  AND r.created_at   >  o.created_at                         -- return strictly after original
  AND r.created_at   <= datetime(o.created_at, '+24 hours')  -- inclusive 24h window
WHERE o.from_account <> o.to_account                         -- ignore self-transfers
  AND ABS(r.amount - o.amount) <= 0.10 * o.amount            -- within 10% of ORIGINAL
ORDER BY o.created_at, r.created_at;
```

### 2.6 Variant - one-to-one matching (no transaction reused)

```sql
-- Scenario 1 variant: each transaction used at most once on each side.
-- Step 1: every return is attributed to its NEAREST preceding original.
-- Step 2: every original keeps only its EARLIEST remaining return.
-- (Window line is SQLite; for PostgreSQL use: r.created_at <= o.created_at + INTERVAL '24 hours')
WITH candidates AS (
    SELECT o.txn_id     AS original_txn_id, r.txn_id     AS return_txn_id,
           o.from_account AS account_a,     o.to_account AS account_b,
           o.amount     AS original_amount, r.amount     AS return_amount,
           o.created_at AS original_at,     r.created_at AS return_at
    FROM transactions o
    JOIN transactions r
      ON  r.from_account = o.to_account
      AND r.to_account   = o.from_account
      AND r.created_at   >  o.created_at
      AND r.created_at   <= datetime(o.created_at, '+24 hours')
    WHERE o.from_account <> o.to_account
      AND ABS(r.amount - o.amount) <= 0.10 * o.amount
),
per_return AS (
    SELECT c.*, ROW_NUMBER() OVER (PARTITION BY return_txn_id
                                   ORDER BY original_at DESC, original_txn_id DESC) AS rn_r
    FROM candidates c
),
per_original AS (
    SELECT p.*, ROW_NUMBER() OVER (PARTITION BY original_txn_id
                                   ORDER BY return_at, return_txn_id) AS rn_o
    FROM per_return p
    WHERE rn_r = 1
)
SELECT original_txn_id, return_txn_id, account_a, account_b,
       original_amount, return_amount,
       ROUND(100.0 * (return_amount - original_amount) / original_amount, 2) AS pct_diff,
       original_at, return_at
FROM per_original
WHERE rn_o = 1
ORDER BY original_at;
```

This is a deterministic greedy rule (nearest original per return, then earliest return per original),
not an optimal bipartite matching - good enough for alerting; explain the trade-off if asked.

### 2.7 Verified output

**PostgreSQL 18.3 - main query (9 rows)**

```
PostgreSQL 18.3
original_txn_id | account_a | account_b | original_amount | original_at         | return_txn_id | return_amount | return_at           | pct_diff | time_gap
----------------+-----------+-----------+-----------------+---------------------+---------------+---------------+---------------------+----------+---------
1               | ACC001    | ACC002    | 1000.00         | 2024-03-01 09:00:00 | 2             | 950.00        | 2024-03-01 15:30:00 | -5.00    | 06:30:00
3               | ACC003    | ACC004    | 100.00          | 2024-03-02 10:00:00 | 4             | 110.00        | 2024-03-02 12:00:00 | 10.00    | 02:00:00
7               | ACC007    | ACC008    | 500.00          | 2024-03-04 08:00:00 | 8             | 500.00        | 2024-03-05 08:00:00 | 0.00     | 1 day   
11              | ACC012    | ACC011    | 300.00          | 2024-03-08 07:00:00 | 12            | 300.00        | 2024-03-08 09:00:00 | 0.00     | 02:00:00
13              | ACC001    | ACC002    | 2000.00         | 2024-03-10 10:00:00 | 15            | 1900.00       | 2024-03-10 18:00:00 | -5.00    | 08:00:00
14              | ACC001    | ACC002    | 2000.00         | 2024-03-10 11:00:00 | 15            | 1900.00       | 2024-03-10 18:00:00 | -5.00    | 07:00:00
16              | ACC003    | ACC004    | 400.00          | 2024-03-11 09:00:00 | 17            | 400.00        | 2024-03-11 10:00:00 | 0.00     | 01:00:00
16              | ACC003    | ACC004    | 400.00          | 2024-03-11 09:00:00 | 18            | 380.00        | 2024-03-11 12:00:00 | -5.00    | 03:00:00
24              | ACC009    | ACC011    | 250.00          | 2024-03-14 09:00:00 | 25            | 225.00        | 2024-03-14 09:30:00 | -10.00   | 00:30:00
(9 rows)
```

Note PG prints the 24h gap as `1 day` (interval normalisation). Use
`EXTRACT(EPOCH FROM r.created_at - o.created_at)/3600 AS gap_hours` or `justify_hours(...)` if a uniform
format is wanted.

**SQLite - main query (9 rows)** (SQLite shows `1000` not `1000.00` because NUMERIC affinity stores an integer)

```
original_txn_id  account_a  account_b  original_amount  original_at          return_txn_id  return_amount  return_at            pct_diff  time_gap
---------------  ---------  ---------  ---------------  -------------------  -------------  -------------  -------------------  --------  --------
1                ACC001     ACC002     1000             2024-03-01 09:00:00  2              950            2024-03-01 15:30:00  -5.0      06:30:00
3                ACC003     ACC004     100              2024-03-02 10:00:00  4              110            2024-03-02 12:00:00  10.0      02:00:00
7                ACC007     ACC008     500              2024-03-04 08:00:00  8              500            2024-03-05 08:00:00  0.0       24:00:00
11               ACC012     ACC011     300              2024-03-08 07:00:00  12             300            2024-03-08 09:00:00  0.0       02:00:00
13               ACC001     ACC002     2000             2024-03-10 10:00:00  15             1900           2024-03-10 18:00:00  -5.0      08:00:00
14               ACC001     ACC002     2000             2024-03-10 11:00:00  15             1900           2024-03-10 18:00:00  -5.0      07:00:00
16               ACC003     ACC004     400              2024-03-11 09:00:00  17             400            2024-03-11 10:00:00  0.0       01:00:00
16               ACC003     ACC004     400              2024-03-11 09:00:00  18             380            2024-03-11 12:00:00  -5.0      03:00:00
24               ACC009     ACC011     250              2024-03-14 09:00:00  25             225            2024-03-14 09:30:00  -10.0     00:30:00
```

**Dedup variant (7 rows; identical on both engines)**

```
original_txn_id  return_txn_id  account_a  account_b  original_amount  return_amount  pct_diff  original_at          return_at
---------------  -------------  ---------  ---------  ---------------  -------------  --------  -------------------  -------------------
1                2              ACC001     ACC002     1000             950            -5.0      2024-03-01 09:00:00  2024-03-01 15:30:00
3                4              ACC003     ACC004     100              110            10.0      2024-03-02 10:00:00  2024-03-02 12:00:00
7                8              ACC007     ACC008     500              500            0.0       2024-03-04 08:00:00  2024-03-05 08:00:00
11               12             ACC012     ACC011     300              300            0.0       2024-03-08 07:00:00  2024-03-08 09:00:00
14               15             ACC001     ACC002     2000             1900           -5.0      2024-03-10 11:00:00  2024-03-10 18:00:00
16               17             ACC003     ACC004     400              400            0.0       2024-03-11 09:00:00  2024-03-11 10:00:00
24               25             ACC009     ACC011     250              225            -10.0     2024-03-14 09:00:00  2024-03-14 09:30:00
```

Rows absent, as intended: 5/6 (10.01%), 9/10 (24h+1s), 19/20 (self), 21-23 (3-hop), 26 (one-way).

### 2.8 Index suggestions and performance

* `CREATE INDEX ix_txn_pair_time ON transactions (from_account, to_account, created_at);`
  The inner side of the self-join is probed with equality on `(from_account, to_account)` and a range on
  `created_at` - exactly the column order of this composite index, so each original costs one index range
  scan (O(n log n) overall instead of O(n^2)).
* Add `INCLUDE (amount)` in PostgreSQL (`... (from_account, to_account, created_at) INCLUDE (amount)`) for an index-only scan.
* For incremental monitoring, restrict the outer side: `WHERE o.created_at >= now() - INTERVAL '48 hours'`;
  an index on `created_at` (or a BRIN index on a huge append-only ledger) serves it.
* Partition the ledger by month on `created_at` at scale; the 24h window touches at most 2 partitions.
* Equal timestamps: if two opposite transfers share a timestamp, the strict `>` drops them. If that matters,
  use `(r.created_at, r.txn_id) > (o.created_at, o.txn_id)` (row-value comparison, PG and SQLite 3.15+).

---

## 3. Scenario 2 - IPL 2024 player performance streaks

> Identify players who scored 30+ runs in at least 3 consecutive matches; return player name and the
> date the streak commenced.

### 3.1 Definitions

* **30+** means `runs >= 30` (exactly 30 counts).
* **Season**: filter `season = 2024` **before** numbering rows, so a 2023 innings can never extend or start
  a 2024 streak (Kohli has a 2023 century in the seed to prove this).
* **"Consecutive matches" - primary interpretation: consecutive appearances (innings) of the player.**
  A batting record is a per-player sequence; this is how cricket stats sites phrase "30+ in N consecutive
  innings", and it needs only `batting_scores`. "Did not bat" = no row, so it neither extends nor breaks.
* **Alternative: consecutive fixtures of the player's team.** Missing a team game (dropped, injured, DNB)
  breaks the streak. Implemented as Approach C. Andre Russell (missed match 8) is the case that
  separates the two interpretations.
* Overlapping streaks are reported once per maximal streak (a 5-match streak is one row, not three).
* Extra columns returned: streak length, end date, runs in streak.

### 3.2 Schema (`schema.sql`)

```sql
-- Scenario 2 schema (portable: PostgreSQL + SQLite)
DROP TABLE IF EXISTS batting_scores;
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS players;

CREATE TABLE players (
    player_id    INTEGER      PRIMARY KEY,
    player_name  VARCHAR(100) NOT NULL,
    team         VARCHAR(10)  NOT NULL      -- franchise for the season (simplification: one team per season)
);

CREATE TABLE matches (
    match_id    INTEGER      PRIMARY KEY,
    match_date  DATE         NOT NULL,
    team1       VARCHAR(10)  NOT NULL,
    team2       VARCHAR(10)  NOT NULL,
    venue       VARCHAR(60),
    season      INTEGER      NOT NULL,
    CHECK (team1 <> team2)
);

-- One row per player who actually BATTED in a match. "Did not bat" = no row.
CREATE TABLE batting_scores (
    match_id     INTEGER  NOT NULL REFERENCES matches(match_id),
    player_id    INTEGER  NOT NULL REFERENCES players(player_id),
    runs         INTEGER  NOT NULL CHECK (runs >= 0),
    balls_faced  INTEGER  NOT NULL CHECK (balls_faced >= 0),
    is_not_out   BOOLEAN  NOT NULL DEFAULT FALSE,
    PRIMARY KEY (match_id, player_id)
);

CREATE INDEX ix_bat_player   ON batting_scores (player_id, match_id);
CREATE INDEX ix_match_season ON matches (season, match_date);
```

### 3.3 Seed data (`seed.sql`) - synthetic 2024-style numbers, real franchise/player names

4 teams x 8 matches each = 16 fixtures (+1 fixture from 2023). Scores are invented to exercise edge cases.

```sql
INSERT INTO players (player_id, player_name, team) VALUES
(1,'Virat Kohli','RCB'),
(2,'Ruturaj Gaikwad','CSK'),
(3,'Rohit Sharma','MI'),
(4,'Sunil Narine','KKR'),
(5,'Andre Russell','KKR'),
(6,'Shivam Dube','CSK'),
(7,'Suryakumar Yadav','MI'),
(8,'MS Dhoni','CSK'),
(9,'Faf du Plessis','RCB');

INSERT INTO matches (match_id, match_date, team1, team2, venue, season) VALUES
( 1,'2024-03-22','CSK','RCB','Chennai',2024),
( 2,'2024-03-23','MI','KKR','Mumbai',2024),
( 3,'2024-03-26','CSK','MI','Chennai',2024),
( 4,'2024-03-27','RCB','KKR','Bengaluru',2024),
( 5,'2024-03-31','KKR','CSK','Kolkata',2024),
( 6,'2024-04-01','RCB','MI','Bengaluru',2024),
( 7,'2024-04-05','RCB','CSK','Bengaluru',2024),
( 8,'2024-04-06','KKR','MI','Kolkata',2024),
( 9,'2024-04-10','MI','CSK','Mumbai',2024),
(10,'2024-04-11','KKR','RCB','Kolkata',2024),
(11,'2024-04-15','CSK','KKR','Chennai',2024),
(12,'2024-04-16','MI','RCB','Mumbai',2024),
(13,'2024-04-20','CSK','RCB','Chennai',2024),
(14,'2024-04-21','MI','KKR','Mumbai',2024),
(15,'2024-04-25','CSK','MI','Chennai',2024),
(16,'2024-04-26','RCB','KKR','Bengaluru',2024),
(17,'2023-05-21','RCB','GT','Bengaluru',2023);

INSERT INTO batting_scores (match_id, player_id, runs, balls_faced, is_not_out) VALUES
-- Virat Kohli (RCB): streak of 5 (incl. exactly 30); 2023 century must NOT extend it
(17,1,101, 76,TRUE),
( 1,1, 45, 35,TRUE),
( 4,1, 30, 25,FALSE),
( 6,1, 77, 58,FALSE),
( 7,1, 52, 40,TRUE),
(10,1, 61, 47,FALSE),
(12,1, 12, 12,FALSE),
(13,1,  8,  9,FALSE),
(16,1, 33, 27,FALSE),
-- Ruturaj Gaikwad (CSK): streak of exactly 3; 29 is not 30+
( 1,2, 12, 12,FALSE),
( 3,2, 35, 28,FALSE),
( 5,2, 48, 38,FALSE),
( 7,2, 31, 25,TRUE),
( 9,2,  5,  7,FALSE),
(11,2, 22, 19,FALSE),
(13,2, 29, 24,FALSE),
(15,2, 40, 32,FALSE),
-- Rohit Sharma (MI): two separate 3-match streaks
( 2,3, 40, 32,FALSE),
( 3,3, 55, 43,FALSE),
( 6,3, 31, 25,TRUE),
( 8,3, 10, 10,TRUE),
( 9,3, 67, 51,FALSE),
(12,3, 30, 25,FALSE),
(14,3, 44, 35,FALSE),
(15,3,  2,  4,FALSE),
-- Sunil Narine (KKR): only streaks of 2 -> excluded
( 2,4, 50, 39,FALSE),
( 4,4, 35, 28,FALSE),
( 5,4,  9,  9,FALSE),
( 8,4, 44, 35,FALSE),
(10,4, 60, 46,FALSE),
(11,4, 12, 12,FALSE),
(14,4,  3,  5,TRUE),
(16,4, 31, 25,TRUE),
-- Andre Russell (KKR): did not bat in match 8: streak only under appearance interpretation
( 2,5, 12, 12,FALSE),
( 4,5, 38, 30,TRUE),
( 5,5, 52, 40,TRUE),
(10,5, 41, 33,FALSE),
(11,5,  8,  9,FALSE),
(14,5, 30, 25,FALSE),
(16,5, 19, 17,FALSE),
-- Shivam Dube (CSK): 30+ runs broken by a 28 -> excluded
( 1,6, 34, 27,FALSE),
( 3,6, 45, 35,TRUE),
( 5,6, 28, 23,FALSE),
( 7,6, 66, 51,TRUE),
( 9,6, 39, 31,FALSE),
(11,6, 12, 12,FALSE),
(13,6, 30, 25,FALSE),
(15,6, 31, 25,TRUE),
-- Suryakumar Yadav (MI): streak of 4
( 2,7,  5,  7,FALSE),
( 3,7,  0,  3,FALSE),
( 6,7, 12, 12,FALSE),
( 8,7, 56, 43,FALSE),
( 9,7, 78, 59,FALSE),
(12,7, 31, 25,TRUE),
(14,7,102, 76,FALSE),
(15,7,  9,  9,FALSE),
-- MS Dhoni (CSK): few appearances, one 30+ -> excluded
( 1,8,  7,  8,FALSE),
( 7,8, 20, 17,FALSE),
(15,8, 37, 30,FALSE),
-- Faf du Plessis (RCB): scattered 30+ -> excluded
( 1,9, 22, 19,FALSE),
( 4,9, 31, 25,TRUE),
( 6,9,  8,  9,FALSE),
( 7,9, 35, 28,FALSE),
(10,9, 41, 33,FALSE),
(12,9,  3,  5,TRUE),
(13,9, 44, 35,FALSE),
(16,9, 20, 17,FALSE);
```

Edge-case map:

| Player | Sequence (2024, in order) | Case | Appearance-based | Fixture-based |
|---|---|---|---|---|
| Virat Kohli | 45, **30**, 77, 52, 61, 12, 8, 33 (+101 in 2023) | streak of 5, exactly 30, prior-season score | 2024-03-22 (5) | 2024-03-22 (5) |
| Ruturaj Gaikwad | 12, 35, 48, 31, 5, 22, **29**, 40 | exactly 3; 29 is not 30+ | 2024-03-26 (3) | same |
| Rohit Sharma | 40, 55, 31, 10, 67, 30, 44, 2 | two separate streaks | 2024-03-23 (3), 2024-04-10 (3) | same |
| Suryakumar Yadav | 5, 0, 12, 56, 78, 31, 102, 9 | streak of 4 | 2024-04-06 (4) | same |
| Andre Russell | 12, 38, 52, *(DNB match 8)*, 41, 8, 30, 19 | missed a team match | 2024-03-27 (3) | **not reported** |
| Sunil Narine | 50, 35, 9, 44, 60, 12, 3, 31 | only streaks of 2 | - | - |
| Shivam Dube | 34, 45, **28**, 66, 39, 12, 30, 31 | broken by < 30 | - | - |
| MS Dhoni | 7, 20, 37 | few innings | - | - |
| Faf du Plessis | 22, 31, 8, 35, 41, 3, 44, 20 | scattered | - | - |

### 3.4 The gaps-and-islands technique, step by step (for a learner)

Goal: find "islands" of consecutive qualifying rows separated by "gaps" of non-qualifying rows.

1. **Number every innings per player in date order** -> `appearance_no` = 1, 2, 3, ...
   (`ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY match_date, match_id)`; `match_id` is a tie-breaker
   so ordering is deterministic).
2. **Throw away the innings below 30.** Now some `appearance_no` values are missing - those holes are the gaps.
3. **Number the remaining (30+) innings again** -> `hit_no` = 1, 2, 3, ... with no holes.
4. **Subtract: `island_id = appearance_no - hit_no`.** While 30+ scores are consecutive, both counters
   go up by 1 together, so the difference stays constant. Every time a sub-30 innings is skipped,
   `appearance_no` jumps by one more than `hit_no`, so the difference increases - a new island starts.
5. **`GROUP BY player_id, island_id`**: each group is one unbroken streak. `MIN(match_date)` is the start,
   `COUNT(*)` its length; keep `HAVING COUNT(*) >= 3`.

Intermediate values (real output from the seed):

```
player_name   match_id  match_date  runs  appearance_no  hit_no  island_id
------------  --------  ----------  ----  -------------  ------  ---------
Virat Kohli   1         2024-03-22  45    1              1       0
Virat Kohli   4         2024-03-27  30    2              2       0
Virat Kohli   6         2024-04-01  77    3              3       0
Virat Kohli   7         2024-04-05  52    4              4       0
Virat Kohli   10        2024-04-11  61    5              5       0
Virat Kohli   12        2024-04-16  12    6
Virat Kohli   13        2024-04-20  8     7
Virat Kohli   16        2024-04-26  33    8              6       2
Rohit Sharma  2         2024-03-23  40    1              1       0
Rohit Sharma  3         2024-03-26  55    2              2       0
Rohit Sharma  6         2024-04-01  31    3              3       0
Rohit Sharma  8         2024-04-06  10    4
Rohit Sharma  9         2024-04-10  67    5              4       1
Rohit Sharma  12        2024-04-16  30    6              5       1
Rohit Sharma  14        2024-04-21  44    7              6       1
Rohit Sharma  15        2024-04-25  2     8
```

Kohli: island 0 has 5 rows -> streak from 2024-03-22. Island 2 has 1 row -> ignored.
Rohit: island 0 (3 rows, from 2024-03-23) and island 1 (3 rows, from 2024-04-10) -> two streaks.

Key subtlety: the `WHERE runs >= 30` must be applied **between** the two `ROW_NUMBER`s (hence two CTEs).
Window functions are evaluated after `WHERE`, so if both were in the same SELECT there would be no gaps.

**LAG/LEAD alternative (Approach B):** look at neighbours instead of grouping. A row is a *streak start*
when it is 30+, the next two innings (`LEAD(runs,1)`, `LEAD(runs,2)`) are 30+, and the previous innings
(`LAG(runs)`) is not 30+ (or does not exist). The "previous is not 30+" condition prevents a 5-match
streak from producing 3 start rows. It answers the brief exactly (name + start date) but does not give the
length without extra work; the threshold "3" is hard-coded into the number of `LEAD`s, while
gaps-and-islands takes any N via `HAVING`.

### 3.5 Approach A (primary) - gaps and islands, consecutive appearances

```sql
-- Scenario 2 / Approach A (PRIMARY): gaps-and-islands with ROW_NUMBER difference.
-- "Consecutive matches" = consecutive APPEARANCES (innings) of the player in the 2024 season.
-- Portable: runs unchanged on PostgreSQL and SQLite >= 3.25.
WITH season_innings AS (            -- 1. every 2024 innings, numbered per player in date order
    SELECT b.player_id,
           m.match_id,
           m.match_date,
           b.runs,
           ROW_NUMBER() OVER (PARTITION BY b.player_id
                              ORDER BY m.match_date, m.match_id) AS appearance_no
    FROM batting_scores b
    JOIN matches m ON m.match_id = b.match_id
    WHERE m.season = 2024
),
hits AS (                           -- 2. keep only 30+ innings, number them again
    SELECT si.*,
           appearance_no
             - ROW_NUMBER() OVER (PARTITION BY player_id
                                  ORDER BY match_date, match_id) AS island_id
    FROM season_innings si
    WHERE runs >= 30                -- WHERE runs before the window function -> gaps appear
),
streaks AS (                        -- 3. one row per island (= unbroken run of 30+ scores)
    SELECT player_id,
           island_id,
           MIN(match_date) AS streak_start,
           MAX(match_date) AS streak_end,
           COUNT(*)        AS streak_matches,
           SUM(runs)       AS streak_runs
    FROM hits
    GROUP BY player_id, island_id
    HAVING COUNT(*) >= 3            -- 4. at least 3 in a row
)
SELECT p.player_name,
       s.streak_start,
       s.streak_matches,
       s.streak_end,
       s.streak_runs
FROM streaks s
JOIN players p ON p.player_id = s.player_id
ORDER BY p.player_name, s.streak_start;
```

### 3.6 Approach B - LAG/LEAD

```sql
-- Scenario 2 / Approach B: LAG/LEAD look-around.
-- A row is a streak START if it is 30+, the next two innings are 30+,
-- and the previous innings is NOT 30+ (or there is no previous innings).
-- Returns exactly what the brief asks for: player name + streak start date.
WITH season_innings AS (
    SELECT b.player_id, m.match_id, m.match_date, b.runs
    FROM batting_scores b
    JOIN matches m ON m.match_id = b.match_id
    WHERE m.season = 2024
),
look_around AS (
    SELECT si.*,
           LAG(runs)     OVER w AS prev_runs,
           LEAD(runs, 1) OVER w AS next1_runs,
           LEAD(runs, 2) OVER w AS next2_runs
    FROM season_innings si
    WINDOW w AS (PARTITION BY player_id ORDER BY match_date, match_id)
)
SELECT p.player_name,
       la.match_date AS streak_start
FROM look_around la
JOIN players p ON p.player_id = la.player_id
WHERE la.runs       >= 30
  AND la.next1_runs >= 30
  AND la.next2_runs >= 30
  AND (la.prev_runs IS NULL OR la.prev_runs < 30)
ORDER BY p.player_name, la.match_date;
```

### 3.7 Approach C - alternative interpretation: consecutive team fixtures

```sql
-- Scenario 2 / Approach C (ALTERNATIVE interpretation):
-- "Consecutive matches" = consecutive FIXTURES of the player's team.
-- Missing a team match (dropped / injured / did not bat) BREAKS the streak.
WITH team_fixtures AS (             -- each team's 2024 fixtures numbered 1..n
    SELECT t.team,
           m.match_id,
           m.match_date,
           ROW_NUMBER() OVER (PARTITION BY t.team
                              ORDER BY m.match_date, m.match_id) AS fixture_no
    FROM matches m
    JOIN (SELECT match_id, team1 AS team FROM matches
          UNION ALL
          SELECT match_id, team2 AS team FROM matches) t
      ON t.match_id = m.match_id
    WHERE m.season = 2024
),
hits AS (                           -- 30+ innings, positioned on the TEAM's fixture list
    SELECT b.player_id,
           f.match_date,
           b.runs,
           f.fixture_no
             - ROW_NUMBER() OVER (PARTITION BY b.player_id
                                  ORDER BY f.match_date, f.match_id) AS island_id
    FROM batting_scores b
    JOIN players p        ON p.player_id = b.player_id
    JOIN team_fixtures f  ON f.match_id  = b.match_id
                         AND f.team      = p.team
    WHERE b.runs >= 30
)
SELECT p.player_name,
       MIN(h.match_date) AS streak_start,
       COUNT(*)          AS streak_matches,
       MAX(h.match_date) AS streak_end
FROM hits h
JOIN players p ON p.player_id = h.player_id
GROUP BY p.player_name, h.player_id, h.island_id
HAVING COUNT(*) >= 3
ORDER BY p.player_name, streak_start;
```

The only change versus A is that the first counter is the **team's** fixture number instead of the
player's appearance number, so a missed team match also creates a gap. If players can move teams
mid-season, replace `players.team` with a `squad(player_id, team, season)` table or with the team the
player actually represented in each match (add `team` to `batting_scores`).

### 3.8 Verified output

**Approach A - PostgreSQL 18.3 (identical on SQLite)**

```
PostgreSQL 18.3
player_name      | streak_start | streak_matches | streak_end | streak_runs
-----------------+--------------+----------------+------------+------------
Andre Russell    | 2024-03-27   | 3              | 2024-04-11 | 131        
Rohit Sharma     | 2024-03-23   | 3              | 2024-04-01 | 126        
Rohit Sharma     | 2024-04-10   | 3              | 2024-04-21 | 141        
Ruturaj Gaikwad  | 2024-03-26   | 3              | 2024-04-05 | 114        
Suryakumar Yadav | 2024-04-06   | 4              | 2024-04-21 | 267        
Virat Kohli      | 2024-03-22   | 5              | 2024-04-11 | 265        
(6 rows)
```

**Approach B - LAG/LEAD (SQLite; identical on PostgreSQL)**

```
player_name       streak_start
----------------  ------------
Andre Russell     2024-03-27
Rohit Sharma      2024-03-23
Rohit Sharma      2024-04-10
Ruturaj Gaikwad   2024-03-26
Suryakumar Yadav  2024-04-06
Virat Kohli       2024-03-22
```

**Approach C - team fixtures (SQLite; identical on PostgreSQL)** - Andre Russell drops out because he did
not bat in KKR's match of 2024-04-06.

```
player_name       streak_start  streak_matches  streak_end
----------------  ------------  --------------  ----------
Rohit Sharma      2024-03-23    3               2024-04-01
Rohit Sharma      2024-04-10    3               2024-04-21
Ruturaj Gaikwad   2024-03-26    3               2024-04-05
Suryakumar Yadav  2024-04-06    4               2024-04-21
Virat Kohli       2024-03-22    5               2024-04-11
```

---

## 4. Dialect notes

| Concept | PostgreSQL | SQLite | MySQL 8 |
|---|---|---|---|
| ts + 24h | `ts + INTERVAL '24 hours'` | `datetime(ts, '+24 hours')` | `ts + INTERVAL 24 HOUR` |
| Gap between timestamps | `t2 - t1` (interval) / `EXTRACT(EPOCH FROM t2 - t1)` | `strftime('%s',t2) - strftime('%s',t1)` (or `unixepoch()` >= 3.38) | `TIMESTAMPDIFF(SECOND, t1, t2)` |
| Money type | `NUMERIC(14,2)` exact | REAL/INTEGER under NUMERIC affinity | `DECIMAL(14,2)` exact |
| Boolean | `BOOLEAN` | `TRUE/FALSE` keywords (>= 3.23) stored as 1/0 | `TINYINT(1)` |
| Window functions | yes | >= 3.25 (`WINDOW w AS` >= 3.28) | >= 8.0 |
| `ROUND(numeric, 2)` | needs NUMERIC arg (`100.0 * ...` is numeric) | works on REAL | works |
| Text comparison of timestamps | typed | works only because ISO-8601 text sorts correctly | typed |

Gotchas met while testing: a JS client (PGlite/node-postgres) converts `DATE`/`TIMESTAMP` into JS `Date`
using the machine's time zone, which shifted displayed values by +05:30 here; the runner returns those
types as raw text to avoid it. Use `TIMESTAMPTZ` in production.

---

## 5. How to capture the screenshots

Option 1 - DB Fiddle (PostgreSQL, best for reviewers, shareable link): https://www.db-fiddle.com
choose "PostgreSQL 15+", paste `schema.sql` + `seed.sql` into the left "Schema SQL" pane and a query in the
right "Query SQL" pane, Run, screenshot the result grid. Save the fiddle and include the URL in the
submission so reviewers can rerun it. One fiddle per scenario.

Option 2 - OneCompiler (https://onecompiler.com/postgresql or /sqlite): paste schema + seed + query into
one editor, Run, screenshot. Also SQLize.online / sqliteonline.com work.

Option 3 - local PostgreSQL in Docker (start Docker Desktop first):
```bash
docker run --name pg -e POSTGRES_PASSWORD=pg -d -p 5432:5432 postgres:17
docker exec -i pg psql -U postgres < s1_schema.sql
docker exec -i pg psql -U postgres < s1_seed.sql
docker exec -i pg psql -U postgres < s1_query_pg.sql
```
Screenshot the terminal (psql prints an aligned table), or connect DBeaver/pgAdmin for a GUI grid.

Option 4 - zero install SQLite:
```bash
sqlite3 -header -box :memory: ".read s1_schema.sql" ".read s1_seed.sql" ".read s1_query_sqlite.sql"
```

Option 5 - automated (section 6): `results.html` renders every query result from both engines in clean
tables, plus a pass/fail line. Open it in a browser and screenshot, or have Playwright do it:
`await page.goto('file:///.../results.html'); await page.screenshot({ path: 'sql-results.png', fullPage: true });`.

Each screenshot should show: the query text (or its name), the engine/version, and the result grid with the
row count. Include one screenshot of the schema (e.g. `\d transactions` in psql or the fiddle's schema pane).

---

## 6. Automated verification (runner with assertions)

Setup used for this document (Node 22.5+; `node:sqlite` is built in):

```bash
npm init -y && npm i @electric-sql/pglite
node --experimental-sqlite --no-warnings run-all.mjs
```

Files expected next to the runner: `s1_schema.sql`, `s1_seed.sql`, `s1_query_pg.sql`, `s1_query_sqlite.sql`,
`s1_dedup.sql`, `s2_schema.sql`, `s2_seed.sql`, `s2_q1_islands.sql`, `s2_q2_lag_lead.sql`,
`s2_q3_team_fixtures.sql` (the code blocks above).

```js
// Runs every scenario query on PostgreSQL (PGlite, real PG compiled to WASM) and
// SQLite (node:sqlite), asserts expected rows, and writes results.html for screenshots.
// Usage: node --experimental-sqlite run-all.mjs     (Node 22.5+, npm i @electric-sql/pglite)
import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';

const sql = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

const cases = [
  { title: 'Scenario 1 - round-trip transfers (all pairs)', schema: 's1_schema.sql', seed: 's1_seed.sql',
    pg: 's1_query_pg.sql', lite: 's1_query_sqlite.sql',
    key: (r) => `${r.original_txn_id}-${r.return_txn_id}`,
    expect: ['1-2', '3-4', '7-8', '11-12', '13-15', '14-15', '16-17', '16-18', '24-25'] },
  { title: 'Scenario 1 - deduplicated one-to-one matches', schema: 's1_schema.sql', seed: 's1_seed.sql',
    pg: 's1_dedup.sql', lite: 's1_dedup.sql',
    pgTransform: (q) => q.replace("datetime(o.created_at, '+24 hours')", "o.created_at + INTERVAL '24 hours'"),
    key: (r) => `${r.original_txn_id}-${r.return_txn_id}`,
    expect: ['1-2', '3-4', '7-8', '11-12', '14-15', '16-17', '24-25'] },
  { title: 'Scenario 2A - streaks, consecutive appearances (gaps & islands)', schema: 's2_schema.sql', seed: 's2_seed.sql',
    pg: 's2_q1_islands.sql', lite: 's2_q1_islands.sql',
    key: (r) => `${r.player_name}|${d(r.streak_start)}|${r.streak_matches}`,
    expect: ['Andre Russell|2024-03-27|3', 'Rohit Sharma|2024-03-23|3', 'Rohit Sharma|2024-04-10|3',
             'Ruturaj Gaikwad|2024-03-26|3', 'Suryakumar Yadav|2024-04-06|4', 'Virat Kohli|2024-03-22|5'] },
  { title: 'Scenario 2B - streak starts via LAG/LEAD', schema: 's2_schema.sql', seed: 's2_seed.sql',
    pg: 's2_q2_lag_lead.sql', lite: 's2_q2_lag_lead.sql',
    key: (r) => `${r.player_name}|${d(r.streak_start)}`,
    expect: ['Andre Russell|2024-03-27', 'Rohit Sharma|2024-03-23', 'Rohit Sharma|2024-04-10',
             'Ruturaj Gaikwad|2024-03-26', 'Suryakumar Yadav|2024-04-06', 'Virat Kohli|2024-03-22'] },
  { title: 'Scenario 2C - streaks, consecutive TEAM fixtures', schema: 's2_schema.sql', seed: 's2_seed.sql',
    pg: 's2_q3_team_fixtures.sql', lite: 's2_q3_team_fixtures.sql',
    key: (r) => `${r.player_name}|${d(r.streak_start)}|${r.streak_matches}`,
    expect: ['Rohit Sharma|2024-03-23|3', 'Rohit Sharma|2024-04-10|3', 'Ruturaj Gaikwad|2024-03-26|3',
             'Suryakumar Yadav|2024-04-06|4', 'Virat Kohli|2024-03-22|5'] },
];

const loc = (v) => { const p = (n) => String(n).padStart(2, '0'); const s = `${v.getFullYear()}-${p(v.getMonth()+1)}-${p(v.getDate())} ${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`; return s.endsWith(' 00:00:00') ? s.slice(0, 10) : s; };
function d(v) { return v instanceof Date ? loc(v) : String(v); }
function fmt(v) {
  if (v instanceof Date) return loc(v);
  if (v && typeof v === 'object') return JSON.stringify(v);  // PG interval
  return String(v);
}
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function table(rows) {
  if (!rows.length) return '<p>(no rows)</p>';
  const cols = Object.keys(rows[0]);
  return `<table><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>${rows
    .map((r) => `<tr>${cols.map((c) => `<td>${esc(fmt(r[c]))}</td>`).join('')}</tr>`).join('')}</table>`;
}

let html = '';
let failures = 0;
for (const c of cases) {
  // PostgreSQL
  const pg = new PGlite({ parsers: { 1082: (v) => v, 1114: (v) => v } }) /* DATE, TIMESTAMP as raw text */;
  await pg.exec(sql(c.schema) + sql(c.seed));
  // Return interval as text for readability
  const pgQuery = (c.pgTransform ?? ((q) => q))(sql(c.pg)).replace('r.created_at - o.created_at ', '(r.created_at - o.created_at)::text ');
  const pgRows = (await pg.query(pgQuery)).rows;
  await pg.close();
  // SQLite
  const lite = new DatabaseSync(':memory:');
  lite.exec(sql(c.schema) + sql(c.seed));
  const liteRows = lite.prepare(sql(c.lite)).all();
  lite.close();

  for (const [engine, rows] of [['PostgreSQL', pgRows], ['SQLite', liteRows]]) {
    try {
      assert.deepEqual(rows.map(c.key), c.expect);
      console.log(`PASS  ${engine.padEnd(10)} ${c.title} (${rows.length} rows)`);
    } catch (e) {
      failures++;
      console.log(`FAIL  ${engine.padEnd(10)} ${c.title}\n  got:      ${JSON.stringify(rows.map(c.key))}\n  expected: ${JSON.stringify(c.expect)}`);
    }
    html += `<h2>${esc(c.title)} <small>${engine}</small></h2>${table(rows)}`;
  }
}

writeFileSync(new URL('results.html', import.meta.url), `<!doctype html><meta charset="utf-8"><title>SQL Scenario Results</title>
<style>body{font:14px system-ui,sans-serif;margin:24px;background:#fff;color:#111}table{border-collapse:collapse;margin-bottom:24px}
th,td{border:1px solid #bbb;padding:4px 10px;text-align:left;font-family:ui-monospace,Consolas,monospace}th{background:#eef}
h2{font-size:16px;margin:20px 0 6px}small{color:#666;font-weight:normal}</style>
<h1>SQL Scenario Results</h1><p>Generated ${new Date().toISOString()} - ${failures ? failures + ' FAILURES' : 'all assertions passed'}</p>${html}`);
console.log(failures ? `\n${failures} failure(s)` : '\nAll assertions passed. Open results.html to screenshot.');
process.exit(failures ? 1 : 0);
```

Actual run output:

```
PASS  PostgreSQL Scenario 1 - round-trip transfers (all pairs) (9 rows)
PASS  SQLite     Scenario 1 - round-trip transfers (all pairs) (9 rows)
PASS  PostgreSQL Scenario 1 - deduplicated one-to-one matches (7 rows)
PASS  SQLite     Scenario 1 - deduplicated one-to-one matches (7 rows)
PASS  PostgreSQL Scenario 2A - streaks, consecutive appearances (gaps & islands) (6 rows)
PASS  SQLite     Scenario 2A - streaks, consecutive appearances (gaps & islands) (6 rows)
PASS  PostgreSQL Scenario 2B - streak starts via LAG/LEAD (6 rows)
PASS  SQLite     Scenario 2B - streak starts via LAG/LEAD (6 rows)
PASS  PostgreSQL Scenario 2C - streaks, consecutive TEAM fixtures (5 rows)
PASS  SQLite     Scenario 2C - streaks, consecutive TEAM fixtures (5 rows)

All assertions passed. Open results.html to screenshot.
```

This doubles as a QA talking point: expected rows were written by hand from the edge-case table first,
then the queries were made to pass on two engines (test-first SQL). It could be a Playwright test
(`test('scenario 1', ...)` with `expect(rows).toEqual(...)`) in the main framework if desired.

---

## 7. Interview talking points

* State assumptions explicitly (10% of original, inclusive bounds, earlier txn is the original, appearances vs fixtures).
* Edge cases are tested at the exact boundaries (10.00% vs 10.01%, 24h vs 24h+1s, 30 vs 29) - classic boundary-value analysis.
* Self-join with a directional time predicate avoids mirror duplicates without `DISTINCT`.
* Gaps-and-islands is the general pattern for "N consecutive X" (login streaks, consecutive failed payments, uptime runs).
* Production hardening: `TIMESTAMPTZ`, exact money, composite index matching the join, incremental windows, partitioning.
