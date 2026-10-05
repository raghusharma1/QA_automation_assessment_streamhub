import { expect, test } from '@playwright/test';
import { freshDatabase, readSql, recordEvidence, runQuery, type Row } from './sql-harness';

const DIR = 'scenario1-round-trips';
const QUERY = readSql(DIR, 'query.sql');
const ONE_TO_ONE = readSql(DIR, 'query-one-to-one.sql');

const pairs = (rows: Row[]) => rows.map((r) => [r.original_txn_id, r.return_txn_id]);

/**
 * Worked out by hand from seed.sql BEFORE running the query (see the edge-case table in
 * sql/README.md). [original, return, A, B, % difference, gap in hours]
 */
const EXPECTED_PAIRS = [
  [1, 2, 'ACC001', 'ACC002', '-5.00', '6.50'], //    E1  basic
  [3, 4, 'ACC003', 'ACC004', '10.00', '2.00'], //    E2  exactly +10%
  [7, 8, 'ACC007', 'ACC008', '0.00', '24.00'], //    E4  exactly 24h
  [11, 12, 'ACC012', 'ACC011', '0.00', '2.00'], //   E6  B paid first: reported once
  [13, 15, 'ACC001', 'ACC002', '-5.00', '8.00'], //  E7  two originals, one return
  [14, 15, 'ACC001', 'ACC002', '-5.00', '7.00'], //  E7
  [16, 17, 'ACC003', 'ACC004', '0.00', '1.00'], //   E8  one original, two returns
  [16, 18, 'ACC003', 'ACC004', '-5.00', '3.00'], //  E8
  [24, 25, 'ACC009', 'ACC011', '-10.00', '0.50'], // E11 exactly -10%
];

test.describe('SQL scenario 1: round-trip transfers', () => {
  test('finds every qualifying (original, return) pair', async ({ page }, testInfo) => {
    const db = await freshDatabase(DIR);
    const rows = await runQuery(db, QUERY);
    await recordEvidence(
      page,
      testInfo,
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
    ).toEqual(EXPECTED_PAIRS);

    // Excluded on purpose: 10.01% (5,6), 24h+1s (9,10), self-transfers (19,20),
    // a three-party cycle (21-23) and a one-way transfer (26).
    const used = new Set(rows.flatMap((r) => [r.original_txn_id, r.return_txn_id]));
    for (const txn of [5, 6, 9, 10, 19, 20, 21, 22, 23, 26])
      expect(used.has(txn), `txn ${txn}`).toBe(false);
  });

  test('one-to-one variant uses each transaction at most once', async ({ page }, testInfo) => {
    const db = await freshDatabase(DIR);
    const rows = await runQuery(db, ONE_TO_ONE);
    await recordEvidence(
      page,
      testInfo,
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
    ]);
    const ids = rows.flatMap((r) => [r.original_txn_id, r.return_txn_id]);
    expect(new Set(ids).size, 'no transaction used twice').toBe(ids.length);
  });

  /**
   * Each seeded boundary must be load-bearing: loosening or tightening one rule of the query has
   * to change the result. If a mutant returns the same rows, the seed has no case for that rule.
   */
  const mutants: {
    rule: string;
    from: string;
    to: string;
    gains?: number[][];
    loses?: number[][];
  }[] = [
    {
      rule: '10% is inclusive',
      from: '<= 0.10 * o.amount',
      to: '< 0.10 * o.amount',
      loses: [
        [3, 4],
        [24, 25],
      ],
    },
    {
      rule: 'tolerance is 10%, not 11%',
      from: '<= 0.10 * o.amount',
      to: '<= 0.11 * o.amount',
      gains: [[5, 6]],
    },
    {
      rule: '24h is inclusive',
      from: "<= o.created_at + INTERVAL '24 hours'",
      to: "< o.created_at + INTERVAL '24 hours'",
      loses: [[7, 8]],
    },
    {
      rule: 'window is 24h, not 25h',
      from: "INTERVAL '24 hours'",
      to: "INTERVAL '25 hours'",
      gains: [[9, 10]],
    },
    {
      rule: 'self-transfers are excluded',
      from: 'WHERE o.from_account <> o.to_account',
      to: 'WHERE TRUE',
      gains: [[19, 20]],
    },
    {
      rule: 'return must come after the original',
      from: 'AND r.created_at   >  o.created_at ',
      to: "AND r.created_at   >= o.created_at - INTERVAL '24 hours' ",
      gains: [[12, 11]],
    },
  ];

  for (const m of mutants) {
    test(`edge case is load-bearing: ${m.rule}`, async () => {
      expect(QUERY, 'mutation anchor exists in query.sql').toContain(m.from);
      const db = await freshDatabase(DIR);
      const original = pairs(await runQuery(db, QUERY));
      const mutated = pairs(await runQuery(db, QUERY.replace(m.from, m.to)));
      for (const pair of m.gains ?? []) {
        expect(original).not.toContainEqual(pair);
        expect(mutated).toContainEqual(pair);
      }
      for (const pair of m.loses ?? []) {
        expect(original).toContainEqual(pair);
        expect(mutated).not.toContainEqual(pair);
      }
    });
  }
});
