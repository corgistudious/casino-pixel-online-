-- Manual rollback for 0027_private_rooms (owner approval + backup first).
-- 1. Close every room and wait until no hand/round is running and nobody is seated in a room
--    (chips at room tables are cashed out to wallets by the engines when players stand):
--      UPDATE card_tables SET status = 'closed' WHERE kind = 'room';
--      UPDATE bj_tables SET status = 'closed' WHERE kind = 'room';
--      SELECT count(*) FROM card_seats s JOIN card_tables t ON t.id = s.table_id WHERE t.kind = 'room';  -- must be 0
--      SELECT count(*) FROM bj_seats s JOIN bj_tables t ON t.id = s.table_id WHERE t.kind = 'room';      -- must be 0
-- 2. Then drop the room metadata. Room table rows stay (their hands and rounds are history the
--    ledger and game_rounds refer to); they remain closed.
DROP TABLE IF EXISTS room_join_attempts;
DROP TABLE IF EXISTS room_access;
DROP TABLE IF EXISTS game_rooms;
ALTER TABLE bj_tables DROP CONSTRAINT IF EXISTS bj_tables_kind_check;
ALTER TABLE card_tables DROP CONSTRAINT IF EXISTS card_tables_kind_check;
-- The kind columns may stay (the previous release ignores them), or:
--   ALTER TABLE card_tables DROP COLUMN kind; ALTER TABLE bj_tables DROP COLUMN kind;
-- but only after deploying the previous release, which lists every open table in its lobbies.
-- Afterwards delete the 0027 row from drizzle.__drizzle_migrations so the migration can re-run.
