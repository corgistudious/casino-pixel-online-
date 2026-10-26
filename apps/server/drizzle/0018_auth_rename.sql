-- Apply ONLY after a verified PostgreSQL backup, to the correct keyo_game DB.
-- Additive and idempotent. Never reset or delete player records.
ALTER TABLE users ADD COLUMN IF NOT EXISTS age integer;
CREATE TABLE IF NOT EXISTS keyo_rename_state (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  free_used boolean NOT NULL DEFAULT false,
  last_renamed_at timestamptz
);
CREATE TABLE IF NOT EXISTS keyo_rename_cards (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0)
);
