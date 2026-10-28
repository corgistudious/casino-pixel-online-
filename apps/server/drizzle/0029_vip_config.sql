-- VIP levels become configuration (admin-editable) instead of code. Additive: the 15 levels from the
-- Owner's original table are copied in with the same EXP thresholds and daily rewards, so nobody's
-- level changes. vip_progress.exp is never touched. Nothing creates further levels on deploy.
CREATE TABLE IF NOT EXISTS vip_levels (
 level integer PRIMARY KEY CHECK (level BETWEEN 1 AND 999),
 name_vi text NOT NULL CHECK (char_length(name_vi) BETWEEN 1 AND 40),
 name_en text NOT NULL CHECK (char_length(name_en) BETWEEN 1 AND 40),
 desc_vi text NOT NULL DEFAULT '' CHECK (char_length(desc_vi) <= 500),
 desc_en text NOT NULL DEFAULT '' CHECK (char_length(desc_en) <= 500),
 icon_asset text REFERENCES assets(id) ON DELETE SET NULL,
 color text NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
 exp_required bigint NOT NULL CHECK (exp_required >= 0),
 daily_silver integer NOT NULL DEFAULT 0 CHECK (daily_silver BETWEEN 0 AND 10000000),
 daily_gold integer NOT NULL DEFAULT 0 CHECK (daily_gold BETWEEN 0 AND 100000),
 benefits jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(benefits) = 'array'),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);
--> statement-breakpoint
INSERT INTO vip_levels (level, name_vi, name_en, color, exp_required, daily_silver, daily_gold) VALUES
 (1, 'VIP 1', 'VIP 1', '#c9cfdc', 0, 5000, 10),
 (2, 'VIP 2', 'VIP 2', '#c9cfdc', 500, 6000, 15),
 (3, 'VIP 3', 'VIP 3', '#c9cfdc', 1500, 7500, 20),
 (4, 'VIP 4', 'VIP 4', '#f2c14e', 3000, 9000, 30),
 (5, 'VIP 5', 'VIP 5', '#f2c14e', 5000, 11000, 45),
 (6, 'VIP 6', 'VIP 6', '#f2c14e', 8000, 13500, 60),
 (7, 'VIP 7', 'VIP 7', '#9fe7f5', 12000, 16000, 80),
 (8, 'VIP 8', 'VIP 8', '#9fe7f5', 18000, 19000, 110),
 (9, 'VIP 9', 'VIP 9', '#9fe7f5', 26000, 23000, 150),
 (10, 'VIP 10', 'VIP 10', '#7cc8ff', 38000, 28000, 200),
 (11, 'VIP 11', 'VIP 11', '#7cc8ff', 55000, 34000, 270),
 (12, 'VIP 12', 'VIP 12', '#7cc8ff', 78000, 41000, 350),
 (13, 'VIP 13', 'VIP 13', '#c27bff', 110000, 50000, 450),
 (14, 'VIP 14', 'VIP 14', '#c27bff', 155000, 62000, 600),
 (15, 'VIP 15', 'VIP 15', '#c27bff', 220000, 80000, 800)
ON CONFLICT (level) DO NOTHING;
--> statement-breakpoint
-- A staff-set level that wins over the EXP level until it expires (NULL = permanent) or is revoked.
ALTER TABLE vip_progress ADD COLUMN IF NOT EXISTS override_level integer REFERENCES vip_levels(level) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE vip_progress ADD COLUMN IF NOT EXISTS override_until timestamptz;
--> statement-breakpoint
ALTER TABLE vip_progress ADD COLUMN IF NOT EXISTS override_reason text;
--> statement-breakpoint
ALTER TABLE vip_progress ADD COLUMN IF NOT EXISTS override_by uuid REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint
-- Every manual VIP change (who, whom, before/after, why). Mission EXP keeps its own records.
CREATE TABLE IF NOT EXISTS vip_events (
 id bigserial PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 kind text NOT NULL CHECK (kind IN ('exp_add', 'exp_remove', 'grant', 'revoke')),
 exp_delta bigint NOT NULL DEFAULT 0,
 old_exp bigint NOT NULL,
 new_exp bigint NOT NULL,
 old_level integer NOT NULL,
 new_level integer NOT NULL,
 override_until timestamptz,
 reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS vip_events_user_idx ON vip_events(user_id, created_at DESC);
--> statement-breakpoint
-- Effective VIP level: an unexpired override, otherwise the highest active level the EXP reaches.
CREATE OR REPLACE FUNCTION keyo_vip_level(p_exp bigint, p_override integer, p_until timestamptz) RETURNS integer
LANGUAGE sql STABLE AS $$
 SELECT CASE
  WHEN p_override IS NOT NULL AND (p_until IS NULL OR p_until > now()) THEN p_override
  ELSE coalesce((SELECT max(level) FROM vip_levels WHERE active AND exp_required <= coalesce(p_exp, 0)), 1)
 END
$$;
