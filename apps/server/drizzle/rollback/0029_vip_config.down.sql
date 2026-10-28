-- Manual rollback for 0029_vip_config (owner approval + backup first). VIP EXP (vip_progress.exp)
-- is untouched; staff overrides and the manual-change history are dropped, and the server falls back
-- to the code table only if the previous release is deployed again.
DROP FUNCTION IF EXISTS keyo_vip_level(bigint, integer, timestamptz);
DROP TABLE IF EXISTS vip_events;
ALTER TABLE vip_progress DROP COLUMN IF EXISTS override_by;
ALTER TABLE vip_progress DROP COLUMN IF EXISTS override_reason;
ALTER TABLE vip_progress DROP COLUMN IF EXISTS override_until;
ALTER TABLE vip_progress DROP COLUMN IF EXISTS override_level;
DROP TABLE IF EXISTS vip_levels;
-- Afterwards delete the 0029 row from drizzle.__drizzle_migrations so the migration can re-run.
