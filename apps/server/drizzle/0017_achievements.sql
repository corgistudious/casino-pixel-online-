CREATE TABLE IF NOT EXISTS achievement_claims (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 achievement_id text NOT NULL,
 claimed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id, achievement_id)
);
