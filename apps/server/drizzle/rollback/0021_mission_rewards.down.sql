-- Manual rollback for 0021_mission_rewards (owner approval + backup first).
-- Only bookkeeping columns go; claims themselves and every payment stay. VIP EXP already granted is kept.
DROP INDEX IF EXISTS quest_claims_user_created_idx;
ALTER TABLE quest_claims DROP COLUMN IF EXISTS vip_exp, DROP COLUMN IF EXISTS reward;
-- Afterwards delete the 0021 row from drizzle.__drizzle_migrations so the migration can re-run.
