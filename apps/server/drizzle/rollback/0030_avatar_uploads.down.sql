-- Manual rollback for 0030_avatar_uploads (owner approval + backup first). Players fall back to
-- their equipped avatar and frame (never changed by 0030). Uploaded image bytes stay in `assets`.
DROP TABLE IF EXISTS avatar_uploads;
-- Afterwards delete the 0030 row from drizzle.__drizzle_migrations so the migration can re-run.
