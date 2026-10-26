-- Manual rollback for 0022_support_center (owner approval + backup first). Tickets and messages stay.
ALTER TABLE support_tickets DROP COLUMN IF EXISTS last_player_reply_at, DROP COLUMN IF EXISTS last_staff_reply_at,
  DROP COLUMN IF EXISTS staff_seen_at, DROP COLUMN IF EXISTS player_seen_at;
ALTER TABLE support_ticket_messages DROP COLUMN IF EXISTS from_staff;
-- Afterwards delete the 0022 row from drizzle.__drizzle_migrations so the migration can re-run.
