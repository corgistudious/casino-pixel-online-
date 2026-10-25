-- Manual rollback for 0007_progression_rank (owner approval + backup first).
-- Removes levels, EXP history, ranks and seasons. Reward mail already delivered stays in the
-- players' mailboxes (only the reward_key marker column is dropped).
-- Afterwards delete the 0007 row from drizzle.__drizzle_migrations so the migration can re-run.
DROP TRIGGER IF EXISTS "exp_events_no_update" ON "exp_events";
DROP TRIGGER IF EXISTS "rank_events_no_update" ON "rank_events";
DROP FUNCTION IF EXISTS "keyo_history_no_update"();
DROP TABLE IF EXISTS "rank_season_results";
DROP TABLE IF EXISTS "rank_events";
DROP TABLE IF EXISTS "player_ranks";
DROP TABLE IF EXISTS "rank_seasons";
DROP TABLE IF EXISTS "level_rewards";
DROP TABLE IF EXISTS "exp_events";
DROP TABLE IF EXISTS "player_progress";
DROP INDEX IF EXISTS "mail_messages_reward_key_idx";
ALTER TABLE "mail_messages" DROP COLUMN IF EXISTS "reward_key";
