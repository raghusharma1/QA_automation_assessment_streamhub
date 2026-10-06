-- Scenario 1, variant: one-to-one matching (no transaction used twice).
-- 1. each return is attributed to its NEAREST preceding original;
-- 2. each original then keeps only its EARLIEST remaining return.
-- A deterministic greedy rule (good for alerting), not an optimal bipartite matching.
WITH candidates AS (
    SELECT o.txn_id       AS original_txn_id, r.txn_id     AS return_txn_id,
           o.from_account AS account_a,       o.to_account AS account_b,
           o.amount       AS original_amount, r.amount     AS return_amount,
           o.created_at   AS original_at,     r.created_at AS return_at
    FROM transactions o
    JOIN transactions r
      ON  r.from_account = o.to_account
      AND r.to_account   = o.from_account
      AND r.created_at   >  o.created_at
      AND r.created_at   <= o.created_at + INTERVAL '24 hours'
    WHERE o.from_account <> o.to_account
      AND ABS(r.amount - o.amount) <= 0.10 * o.amount
),
per_return AS (
    SELECT c.*, ROW_NUMBER() OVER (PARTITION BY return_txn_id
                                   ORDER BY original_at DESC, original_txn_id DESC) AS rn_return
    FROM candidates c
),
per_original AS (
    SELECT p.*, ROW_NUMBER() OVER (PARTITION BY original_txn_id
                                   ORDER BY return_at, return_txn_id) AS rn_original
    FROM per_return p
    WHERE rn_return = 1
)
SELECT original_txn_id, return_txn_id, account_a, account_b,
       original_amount, return_amount,
       ROUND(100.0 * (return_amount - original_amount) / original_amount, 2) AS pct_diff,
       original_at, return_at
FROM per_original
WHERE rn_original = 1
ORDER BY original_at, original_txn_id;
