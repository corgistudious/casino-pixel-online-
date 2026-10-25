CREATE TABLE IF NOT EXISTS vip_progress (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
 exp bigint NOT NULL DEFAULT 0 CHECK (exp >= 0),
 last_claim_date date,
 updated_at timestamptz NOT NULL DEFAULT now()
);
