-- Manual rollback for 0023_mission_settings (owner approval + backup first).
-- Missions fall back to the code defaults; claims and payments already made are untouched.
DROP TABLE IF EXISTS mission_settings;
-- Afterwards delete the 0023 row from drizzle.__drizzle_migrations so the migration can re-run.
