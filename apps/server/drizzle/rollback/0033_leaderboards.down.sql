-- Manual rollback for 0033_leaderboards (owner approval + backup first). Removes leaderboard
-- statistics, snapshots, awards and tournament results; game history, wallets and items are untouched.
-- Frames already granted as awards stay in inventories (roll back 0034 for those).
BEGIN;
DROP TRIGGER IF EXISTS game_rounds_leaderboard_stats ON game_rounds;
DROP FUNCTION IF EXISTS keyo_record_game_result();
DROP TABLE IF EXISTS tournament_results;
DROP TABLE IF EXISTS tournaments;
DROP TABLE IF EXISTS leaderboard_awards;
DROP TABLE IF EXISTS leaderboard_snapshots;
DROP FUNCTION IF EXISTS keyo_append_only();
DROP TABLE IF EXISTS player_game_daily;
DROP TABLE IF EXISTS player_game_stats;
DROP FUNCTION IF EXISTS keyo_board_game(text);
DROP INDEX IF EXISTS profile_likes_created_idx;
DROP INDEX IF EXISTS player_follows_created_idx;
DROP INDEX IF EXISTS charm_ledger_created_idx;
DROP INDEX IF EXISTS quest_claims_created_idx;
COMMIT;
-- Afterwards delete the 0033 row from drizzle.__drizzle_migrations.
