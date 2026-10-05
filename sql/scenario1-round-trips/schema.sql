-- Scenario 1: round-trip transfers. PostgreSQL 14+ (also runs on PGlite).
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS accounts;

CREATE TABLE accounts (
    account_id   VARCHAR(10)   PRIMARY KEY,
    holder_name  VARCHAR(100)  NOT NULL,
    opened_at    TIMESTAMP     NOT NULL
);

CREATE TABLE transactions (
    txn_id        INTEGER        PRIMARY KEY,
    from_account  VARCHAR(10)    NOT NULL REFERENCES accounts (account_id),
    to_account    VARCHAR(10)    NOT NULL REFERENCES accounts (account_id),
    amount        NUMERIC(14,2)  NOT NULL CHECK (amount > 0),   -- exact decimal: no float error at the 10% boundary
    created_at    TIMESTAMP      NOT NULL
    -- Deliberately no CHECK (from_account <> to_account): self-transfers exist in real ledgers
    -- (sweeps, test transactions), and the query must be robust to them.
);

-- Serves the self-join probe: equality on the account pair, range on the time.
CREATE INDEX ix_txn_pair_time ON transactions (from_account, to_account, created_at);
