-- Missions redesign: claims record what was paid and how much VIP EXP was granted (weekly cap).
-- Additive; existing claims keep counting (same mission ids and period keys).
ALTER TABLE quest_claims ADD COLUMN IF NOT EXISTS reward jsonb;
--> statement-breakpoint
ALTER TABLE quest_claims ADD COLUMN IF NOT EXISTS vip_exp integer NOT NULL DEFAULT 0 CHECK (vip_exp >= 0);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS quest_claims_user_created_idx ON quest_claims(user_id, created_at DESC);
