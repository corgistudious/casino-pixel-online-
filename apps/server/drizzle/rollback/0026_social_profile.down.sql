-- Manual rollback for 0026_social_profile (owner approval + backup first). Removes follows, likes,
-- blocks, privacy settings and player reports; nothing else references them. Export
-- player_reports first if the moderation history must be kept:
--   \copy player_reports TO 'player_reports.csv' CSV HEADER
DROP TABLE IF EXISTS player_reports;
DROP TABLE IF EXISTS profile_settings;
DROP TABLE IF EXISTS player_blocks;
DROP TABLE IF EXISTS profile_likes;
DROP TABLE IF EXISTS player_follows;
-- Afterwards delete the 0026 row from drizzle.__drizzle_migrations so the migration can re-run.
