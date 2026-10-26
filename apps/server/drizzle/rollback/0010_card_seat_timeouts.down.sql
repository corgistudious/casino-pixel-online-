-- Manual rollback for 0010_card_seat_timeouts (owner approval + backup first). Drops only the AFK counter; no player data.
ALTER TABLE "card_seats" DROP COLUMN IF EXISTS "timeouts";
-- Afterwards delete the 0010 row from drizzle.__drizzle_migrations so the migration can re-run.
