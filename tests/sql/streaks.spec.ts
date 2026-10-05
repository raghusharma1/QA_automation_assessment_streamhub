import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { buildIplSeed, SEED_PATH } from '../../sql/scripts/build-ipl-seed';
import { freshDatabase, readSql, recordEvidence, runQuery, type Row } from './sql-harness';

const DIR = 'scenario2-streaks';
const QUERY = readSql(DIR, 'query.sql');
const LAG_LEAD = readSql(DIR, 'query-lag-lead.sql');
const TEAM_FIXTURES = readSql(DIR, 'query-team-fixtures.sql');

/** COUNT/SUM are BIGINT in PostgreSQL; compare them as plain numbers. */
const plain = (rows: Row[]) =>
  rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]),
    ),
  );
const starts = (rows: Row[]) => rows.map((r) => [r.player_name, r.streak_start]);

/**
 * Worked out by hand from innings.json BEFORE running the queries (edge-case table in
 * sql/README.md). [player, streak start, matches, streak end, runs]
 */
const EXPECTED_APPEARANCE_STREAKS = [
  ['Andre Russell', '2024-03-23', 4, '2024-05-21', 177], //   did not bat in one KKR match
  ['Faf du Plessis', '2024-03-22', 3, '2024-04-15', 128], //  first of two streaks
  ['Faf du Plessis', '2024-04-28', 3, '2024-05-22', 138], //  second streak
  ['Ruturaj Gaikwad', '2024-04-23', 3, '2024-05-12', 212], // exactly 3
  ['Sunil Narine', '2024-05-05', 3, '2024-05-26', 151], //    spans the washed-out match 19
  ['Virat Kohli', '2024-03-22', 5, '2024-04-28', 265], //     includes exactly 30; 2023 ignored
];

test.describe('SQL scenario 2: IPL 30+ run streaks', () => {
  test('seed.sql is up to date with api/data and innings.json', () => {
    expect(readFileSync(SEED_PATH, 'utf8'), 'run `npm run sql:seed` to regenerate').toBe(
      buildIplSeed(),
    );
  });

  test('primary: streaks over consecutive appearances (gaps and islands)', async ({
    page,
  }, testInfo) => {
    const db = await freshDatabase(DIR);
    const rows = plain(await runQuery(db, QUERY));
    await recordEvidence(
      page,
      testInfo,
      'scenario2-streaks',
      'Scenario 2: 30+ runs in 3+ consecutive matches (primary: consecutive appearances)',
      QUERY,
      rows,
    );

    expect(
      rows.map((r) => [
        r.player_name,
        r.streak_start,
        r.streak_matches,
        r.streak_end,
        r.streak_runs,
      ]),
    ).toEqual(EXPECTED_APPEARANCE_STREAKS);
    // Never reported: Samson (a 29 breaks his run), Head (two streaks of 2).
    const names = rows.map((r) => r.player_name);
    expect(names).not.toContain('Sanju Samson');
    expect(names).not.toContain('Travis Head');
  });

  test('LAG/LEAD technique returns the same names and start dates', async ({ page }, testInfo) => {
    const db = await freshDatabase(DIR);
    const rows = await runQuery(db, LAG_LEAD);
    await recordEvidence(
      page,
      testInfo,
      'scenario2-streaks-lag-lead',
      'Scenario 2: LAG/LEAD technique (name + start date)',
      LAG_LEAD,
      rows,
    );
    expect(starts(rows)).toEqual(EXPECTED_APPEARANCE_STREAKS.map(([name, start]) => [name, start]));
  });

  test('alternative: streaks over consecutive team matches played', async ({ page }, testInfo) => {
    const db = await freshDatabase(DIR);
    const rows = plain(await runQuery(db, TEAM_FIXTURES));
    await recordEvidence(
      page,
      testInfo,
      'scenario2-streaks-team-fixtures',
      'Scenario 2 alternative: consecutive team matches played',
      TEAM_FIXTURES,
      rows,
    );

    // Identical except Russell: the KKR match he did not bat in breaks his run.
    expect(
      rows.map((r) => [r.player_name, r.streak_start, r.streak_matches, r.streak_end]),
    ).toEqual(
      EXPECTED_APPEARANCE_STREAKS.filter(([name]) => name !== 'Andre Russell').map((r) =>
        r.slice(0, 4),
      ),
    );
  });

  const mutants: {
    rule: string;
    query: string;
    from: string;
    to: string;
    check: (rows: Row[]) => void;
  }[] = [
    {
      rule: 'exactly 30 counts (>= not >)',
      query: QUERY,
      from: 'WHERE runs >= 30',
      to: 'WHERE runs > 30',
      check: (rows) => expect(starts(rows)).not.toContainEqual(['Virat Kohli', '2024-03-22']),
    },
    {
      rule: 'a 29 breaks the streak',
      query: QUERY,
      from: 'WHERE runs >= 30',
      to: 'WHERE runs >= 29',
      check: (rows) => expect(starts(rows)).toContainEqual(['Sanju Samson', '2024-03-28']),
    },
    {
      rule: 'two streaks of 2 are not a streak of 3',
      query: QUERY,
      from: 'HAVING COUNT(*) >= 3',
      to: 'HAVING COUNT(*) >= 2',
      check: (rows) => expect(rows.map((r) => r.player_name)).toContain('Travis Head'),
    },
    {
      rule: 'the season filter keeps 2023 out of 2024 streaks',
      query: QUERY,
      from: 'WHERE m.season = 2024',
      to: 'WHERE m.season >= 2023',
      check: (rows) => expect(starts(rows)).toContainEqual(['Virat Kohli', '2023-05-21']),
    },
    {
      rule: 'an abandoned fixture is not a match played',
      query: TEAM_FIXTURES,
      from: 'AND NOT m.abandoned',
      to: '',
      check: (rows) => expect(rows.map((r) => r.player_name)).not.toContain('Sunil Narine'),
    },
  ];

  for (const m of mutants) {
    test(`edge case is load-bearing: ${m.rule}`, async () => {
      expect(m.query, 'mutation anchor exists in the query').toContain(m.from);
      const db = await freshDatabase(DIR);
      m.check(await runQuery(db, m.query.replace(m.from, m.to)));
    });
  }
});
