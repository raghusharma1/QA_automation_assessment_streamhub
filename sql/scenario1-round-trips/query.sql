-- Scenario 1: every (original, return) pair where B sends a similar amount back to A within 24h.
-- Definitions: sql/README.md. "Similar" = within 10% of the ORIGINAL amount, inclusive.
SELECT
    o.txn_id                                                      AS original_txn_id,
    o.from_account                                                AS account_a,
    o.to_account                                                  AS account_b,
    o.amount                                                      AS original_amount,
    o.created_at                                                  AS original_at,
    r.txn_id                                                      AS return_txn_id,
    r.amount                                                      AS return_amount,
    r.created_at                                                  AS return_at,
    ROUND(100.0 * (r.amount - o.amount) / o.amount, 2)            AS pct_diff,
    ROUND(EXTRACT(EPOCH FROM r.created_at - o.created_at) / 3600, 2) AS gap_hours
FROM transactions o
JOIN transactions r
  ON  r.from_account = o.to_account                            -- B pays ...
  AND r.to_account   = o.from_account                          -- ... back to A
  AND r.created_at   >  o.created_at                           -- strictly after the original
  AND r.created_at   <= o.created_at + INTERVAL '24 hours'     -- at most exactly 24h later
WHERE o.from_account <> o.to_account                           -- ignore self-transfers
  AND ABS(r.amount - o.amount) <= 0.10 * o.amount              -- within 10% of the original
ORDER BY o.created_at, r.created_at, o.txn_id, r.txn_id;  -- txn ids: a total order
