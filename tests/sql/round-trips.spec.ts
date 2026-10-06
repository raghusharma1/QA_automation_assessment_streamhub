import { expect, test } from '@playwright/test';
import {
  freshDatabase,
  readSql,
  recordEvidence,
  runQuery,
  SCHEMA_SQL,
  type Row,
} from './sql-harness';

const DIR = 'scenario1-round-trips';
const QUERY = readSql(DIR, 'query.sql');
const ONE_TO_ONE = readSql(DIR, 'query-one-to-one.sql');

const pairs = (rows: Row[]) => rows.map((r) => [r.original_txn_id, r.return_txn_id]);

/**
 * Worked out by hand from seed.sql BEFORE running the query (see the edge-case table in
 * sql/README.md). [original, return, A, B, % difference, gap in hours]
 */
const EXPECTED = [
  [1, 2, 'ACC001', 'ACC002', '-5.00', '6.50'], //    E1  basic
  [3, 4, 'ACC003', 'ACC004', '10.00', '2.00'], //    E2  exactly +10%
  [7, 8, 'ACC007', 'ACC008', '0.00', '24.00'], //    E4  exactly 24h
  [11, 12, 'ACC012', 'ACC011', '0.00', '2.00'], //   E6  B paid first: reported once
  [13, 15, 'ACC001', 'ACC002', '-5.00', '8.00'], //  E7  two originals, one return
  [14, 15, 'ACC001', 'ACC002', '-5.00', '7.00'], //  E7
  [16, 17, 'ACC003', 'ACC004', '0.00', '1.00'], //   E8  one original, two returns
  [16, 18, 'ACC003', 'ACC004', '-5.00', '3.00'], //  E8
  [24, 25, 'ACC009', 'ACC011', '-10.00', '0.50'], // E11 exactly -10%
  [27, 28, 'ACC013', 'ACC014', '0.00', '1.00'], //   E13 ping-pong: 28 returns 27 ...
  [28, 29, 'ACC014', 'ACC013', '0.00', '1.00'], //   E13 ... and is the original of 29
];
const EXPECTED_PAIRS = EXPECTED.map(([o, r]) => [o, r]);

test.describe('SQL scenario 1: round-trip transfers', () => {
  test('table schema', async ({ page }, testInfo) => {
    const db = await freshDatabase(DIR);
    const rows = await runQuery(db, SCHEMA_SQL);
    await recordEvidence(
      page,
      testInfo,
      db,
      'scenario1-schema',
      'Scenario 1: table schema',
      SCHEMA_SQL,
      rows,
    );
    expect([...new Set(rows.map((r) => r.table_name))]).toEqual(['accounts', 'transactions']);
  });

  test('finds every qualifying (original, return) pair', async ({ page }, testInfo) => {
    const db = await freshDatabase(DIR);
    const rows = await runQuery(db, QUERY);
    await recordEvidence(
      page,
      testInfo,
      db,
      'scenario1-round-trips',
      'Scenario 1: round-trip transfers (all pairs)',
      QUERY,
      rows,
    );

    expect(
      rows.map((r) => [
        r.original_txn_id,
        r.return_txn_id,
        r.account_a,
        r.account_b,
        r.pct_diff,
        r.gap_hours,
      ]),
    ).toEqual(EXPECTED);

    // Excluded on purpose: 10.01% (5,6), 24h+1s (9,10), self-transfers (19,20),
    // a three-party cycle (21-23), a one-way transfer (26) and the same second (30,31).
    const used = new Set(rows.flatMap((r) => [r.original_txn_id, r.return_txn_id]));
    for (const txn of [5, 6, 9, 10, 19, 20, 21, 22, 23, 26, 30, 31])
      expect(used.has(txn), `txn ${txn}`).toBe(false);
  });

  test('one-to-one variant uses each transaction at most once per side', async ({
    page,
  }, testInfo) => {
    const db = await freshDatabase(DIR);
    const rows = await runQuery(db, ONE_TO_ONE);
    await recordEvidence(
      page,
      testInfo,
      db,
      'scenario1-round-trips-one-to-one',
      'Scenario 1 variant: one-to-one matching',
      ONE_TO_ONE,
      rows,
    );

    expect(pairs(rows)).toEqual([
      [1, 2],
      [3, 4],
      [7, 8],
      [11, 12],
      [14, 15],
      [16, 17],
      [24, 25],
      [27, 28],
      [28, 29],
    ]);
    const originals = rows.map((r) => r.original_txn_id);
    const returns = rows.map((r) => r.return_txn_id);
    expect(new Set(originals).size, 'no original used twice').toBe(originals.length);
    expect(new Set(returns).size, 'no return used twice').toBe(returns.length);
  });

  /**
   * Each seeded boundary must be load-bearing: changing one rule of the query has to change the
   * result in exactly the expected way. The full mutated result is asserted, so a mutant that
   * breaks the query some other way (e.g. returns nothing) can't pass by accident.
   */
  const mutants: { rule: string; from: string; to: string; expected: unknown[][] }[] = [
    {
      rule: '10% is inclusive',
      from: '<= 0.10 * o.amount',
      to: '< 0.10 * o.amount',
      expected: EXPECTED_PAIRS.filter(([o]) => o !== 3 && o !== 24),
    },
    {
      rule: 'tolerance is 10%, not 11%',
      from: '<= 0.10 * o.amount',
      to: '<= 0.11 * o.amount',
      expected: [...EXPECTED_PAIRS.slice(0, 2), [5, 6], ...EXPECTED_PAIRS.slice(2)],
    },
    {
      rule: '24h is inclusive',
      from: "<= o.created_at + INTERVAL '24 hours'",
      to: "< o.created_at + INTERVAL '24 hours'",
      expected: EXPECTED_PAIRS.filter(([o]) => o !== 7),
    },
    {
      rule: 'window is 24h, not 25h',
      from: "INTERVAL '24 hours'",
      to: "INTERVAL '25 hours'",
      expected: [...EXPECTED_PAIRS.slice(0, 3), [9, 10], ...EXPECTED_PAIRS.slice(3)],
    },
    {
      rule: 'self-transfers are excluded',
      from: 'WHERE o.from_account <> o.to_account',
      to: 'WHERE TRUE',
      expected: [...EXPECTED_PAIRS.slice(0, 8), [19, 20], ...EXPECTED_PAIRS.slice(8)],
    },
    {
      rule: 'the return must go back to A (not on to a third party)',
      from: 'AND r.to_account   = o.from_account',
      to: 'AND TRUE',
      expected: [...EXPECTED_PAIRS.slice(0, 8), [21, 22], [22, 23], ...EXPECTED_PAIRS.slice(8)],
    },
    {
      // Without E14 this mutant survived: no seed row distinguished > from >=.
      rule: 'the return is strictly after the original (same second is not a reply)',
      from: 'AND r.created_at   >  o.created_at',
      to: 'AND r.created_at   >= o.created_at',
      expected: [...EXPECTED_PAIRS, [30, 31], [31, 30]],
    },
  ];

  for (const m of mutants) {
    test(`edge case is load-bearing: ${m.rule}`, async () => {
      expect(QUERY, 'mutation anchor exists in query.sql').toContain(m.from);
      const db = await freshDatabase(DIR);
      expect(pairs(await runQuery(db, QUERY.replace(m.from, m.to)))).toEqual(m.expected);
    });
  }
});
