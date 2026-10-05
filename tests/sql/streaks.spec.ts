import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { buildIplSeed, SEED_PATH } from '../../sql/scripts/build-ipl-seed';
import {
  freshDatabase,
  readSql,
  recordEvidence,
  runQuery,
  SCHEMA_SQL,
  type Row,
} from './sql-harness';

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
const EXPECTED = [
  ['Andre Russell', '2024-03-23', 4, '2024-05-21', 177], //   did not bat in one KKR match
  ['Faf du Plessis', '2024-03-22', 3, '2024-04-15', 128], //  first of two streaks
  ['Faf du Plessis', '2024-04-28', 3, '2024-05-22', 138], //  second streak
  ['Ruturaj Gaikwad', '2024-04-23', 3, '2024-05-12', 212], // exactly 3
  ['Sunil Narine', '2024-05-05', 3, '2024-05-26', 151], //    spans the washed-out match 19
  ['Virat Kohli', '2024-03-22', 5, '2024-04-28', 265], //     includes exactly 30; 2023 ignored
];
const EXPECTED_STARTS = EXPECTED.map(([name, start]) => [name, start]);
const without = (name: string) => EXPECTED_STARTS.filter(([n]) => n !== name);

test.describe('SQL scenario 2: IPL 30+ run streaks', () => {
  test('seed.sql is up to date with api/data and innings.json', () => {
    expect(readFileSync(SEED_PATH, 'utf8'), 'run `npm run sql:seed` to regenerate').toBe(
      buildIplSeed(),
    );
  });

  test('table schema', async ({ page }, testInfo) => {
    const db = await freshDatabase(DIR);
    const rows = await runQuery(db, SCHEMA_SQL);
    await recordEvidence(
      page,
      testInfo,
      db,
      'scenario2-schema',
      'Scenario 2: table schema',
      SCHEMA_SQL,
      rows,
    );
    expect([...new Set(rows.map((r) => r.table_name))]).toEqual([
      'batting_scores',
      'matches',
      'players',
    ]);
  });

  test('primary: streaks over consecutive appearances (gaps and islands)', async ({
    page,
  }, testInfo) => {
    const db = await freshDatabase(DIR);
    const rows = plain(await runQuery(db, QUERY));
    await recordEvidence(
      page,
      testInfo,
      db,
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
    ).toEqual(EXPECTED);
  });

  test('LAG/LEAD technique returns the same names and start dates', async ({ page }, testInfo) => {
    const db = await freshDatabase(DIR);
    const rows = await runQuery(db, LAG_LEAD);
    await recordEvidence(
      page,
      testInfo,
      db,
      'scenario2-streaks-lag-lead',
      'Scenario 2: LAG/LEAD technique (name + start date)',
      LAG_LEAD,
      rows,
    );
    expect(starts(rows)).toEqual(EXPECTED_STARTS);
  });

  test('alternative: streaks over consecutive team matches played', async ({ page }, testInfo) => {
    const db = await freshDatabase(DIR);
    const rows = plain(await runQuery(db, TEAM_FIXTURES));
    await recordEvidence(
      page,
      testInfo,
      db,
      'scenario2-streaks-team-fixtures',
      'Scenario 2 alternative: consecutive team matches played',
      TEAM_FIXTURES,
      rows,
    );

    // Identical except Russell: the KKR match he did not bat in breaks his run.
    expect(
      rows.map((r) => [r.player_name, r.streak_start, r.streak_matches, r.streak_end]),
    ).toEqual(EXPECTED.filter(([name]) => name !== 'Andre Russell').map((r) => r.slice(0, 4)));
  });

  /**
   * Each seeded boundary must be load-bearing. The FULL mutated result (names + start dates) was
   * worked out by hand, so a mutant can't pass by breaking the query some other way.
   */
  const mutants: {
    rule: string;
    query: string;
    edits: [string, string][];
    expected: unknown[][];
  }[] = [
    {
      rule: 'exactly 30 counts (>= not >)',
      query: QUERY,
      edits: [['WHERE runs >= 30', 'WHERE runs > 30']],
      // Kohli's 30 no longer counts: his streak now starts with the 77 on 04-15.
      expected: [...without('Virat Kohli'), ['Virat Kohli', '2024-04-15']],
    },
    {
      rule: 'a 29 breaks the streak',
      query: QUERY,
      edits: [['WHERE runs >= 30', 'WHERE runs >= 29']],
      expected: [
        ...EXPECTED_STARTS.slice(0, 4),
        ['Sanju Samson', '2024-03-28'],
        ...EXPECTED_STARTS.slice(4),
      ],
    },
    {
      rule: 'two streaks of 2 are not a streak of 3',
      query: QUERY,
      edits: [['HAVING COUNT(*) >= 3', 'HAVING COUNT(*) >= 2']],
      expected: [
        ...EXPECTED_STARTS.slice(0, 4),
        ['Sanju Samson', '2024-03-28'],
        ['Sanju Samson', '2024-05-22'],
        ['Sunil Narine', '2024-05-05'],
        ['Travis Head', '2024-03-23'],
        ['Travis Head', '2024-05-21'],
        ['Virat Kohli', '2024-03-22'],
      ],
    },
    {
      rule: 'the season filter keeps 2023 out of 2024 streaks',
      query: QUERY,
      edits: [['WHERE m.season = 2024', 'WHERE m.season >= 2023']],
      expected: [...without('Virat Kohli'), ['Virat Kohli', '2023-05-21']],
    },
    {
      rule: 'the season must be filtered BEFORE numbering, not after',
      query: QUERY,
      edits: [
        ['WHERE m.season = 2024', 'WHERE TRUE'],
        [
          'JOIN players p ON p.player_id = s.player_id',
          "JOIN players p ON p.player_id = s.player_id\nWHERE s.streak_start >= DATE '2024-01-01'",
        ],
      ],
      // Filtering afterwards drops Kohli's streak entirely (it now "starts" in 2023).
      expected: without('Virat Kohli'),
    },
    {
      rule: 'LAG/LEAD needs the "previous innings < 30" guard',
      query: LAG_LEAD,
      edits: [['AND (la.prev_runs IS NULL OR la.prev_runs < 30)', '']],
      // Without it, every innings that starts 3+ in a row is reported as a "start".
      expected: [
        ['Andre Russell', '2024-03-23'],
        ['Andre Russell', '2024-04-03'],
        ['Faf du Plessis', '2024-03-22'],
        ['Faf du Plessis', '2024-04-28'],
        ['Ruturaj Gaikwad', '2024-04-23'],
        ['Sunil Narine', '2024-05-05'],
        ['Virat Kohli', '2024-03-22'],
        ['Virat Kohli', '2024-03-25'],
        ['Virat Kohli', '2024-04-15'],
      ],
    },
    {
      rule: 'an abandoned fixture is not a match played',
      query: TEAM_FIXTURES,
      edits: [['AND NOT m.abandoned', '']],
      // The washout now counts as a KKR match Narine "missed", which breaks his streak.
      expected: without('Andre Russell').filter(([n]) => n !== 'Sunil Narine'),
    },
  ];

  for (const m of mutants) {
    test(`edge case is load-bearing: ${m.rule}`, async () => {
      let sql = m.query;
      for (const [from, to] of m.edits) {
        expect(sql, 'mutation anchor exists in the query').toContain(from);
        sql = sql.replace(from, to);
      }
      const db = await freshDatabase(DIR);
      expect(starts(await runQuery(db, sql))).toEqual(m.expected);
    });
  }
});
