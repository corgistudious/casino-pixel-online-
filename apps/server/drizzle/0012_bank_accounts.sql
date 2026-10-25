-- Non-destructive bank balances and transfer journal.
CREATE TABLE IF NOT EXISTS bank_accounts (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
 silver bigint NOT NULL DEFAULT 0 CHECK (silver >= 0),
 gold bigint NOT NULL DEFAULT 0 CHECK (gold >= 0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bank_transfers (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 currency text NOT NULL CHECK (currency IN ('silver','gold')),
 direction text NOT NULL CHECK (direction IN ('deposit','withdraw')),
 amount bigint NOT NULL CHECK (amount > 0),
 wallet_after bigint NOT NULL CHECK (wallet_after >= 0),
 bank_after bigint NOT NULL CHECK (bank_after >= 0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_transfers_user_date_idx ON bank_transfers(user_id, created_at DESC);
