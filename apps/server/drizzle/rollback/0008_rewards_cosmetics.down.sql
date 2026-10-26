-- Manual rollback for 0008_rewards_cosmetics (owner approval + backup first).
-- Deliver or cancel pending season rewards first: SELECT count(*) FROM season_rewards WHERE status = 'pending'.
-- Mail already delivered stays in players' mailboxes. Owned titles/bubbles/card backs would block
-- restoring the old kind check: those inventory rows must be archived first (they are not deleted here).
DROP TRIGGER IF EXISTS "season_rewards_immutable" ON "season_rewards";
DROP FUNCTION IF EXISTS "keyo_season_rewards_guard"();
DROP TABLE IF EXISTS "giftcode_redemptions";
DROP TABLE IF EXISTS "giftcodes";
DROP TABLE IF EXISTS "reward_flags";
DROP TABLE IF EXISTS "season_rewards";
ALTER TABLE "rank_events" DROP COLUMN IF EXISTS "reward_silver", DROP COLUMN IF EXISTS "opponent_ids";
ALTER TABLE "player_ranks" DROP COLUMN IF EXISTS "disqualified", DROP COLUMN IF EXISTS "disqualified_reason";
ALTER TABLE "rank_seasons" DROP COLUMN IF EXISTS "participation", DROP COLUMN IF EXISTS "auto_rollover";
ALTER TABLE "users" DROP COLUMN IF EXISTS "equipped_title", DROP COLUMN IF EXISTS "equipped_bubble", DROP COLUMN IF EXISTS "equipped_card_back";
DROP INDEX IF EXISTS "inventory_items_expiry_idx";
ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "expires_at";
-- Afterwards delete the 0008 row from drizzle.__drizzle_migrations so the migration can re-run.
