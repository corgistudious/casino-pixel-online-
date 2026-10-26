-- Manual rollback for 0009_card_tables (owner approval + backup first).
-- Every seated player must be cashed out first (their chips are Cxu Bạc held at the table):
--   SELECT count(*) FROM card_seats s JOIN card_tables t ON t.id = s.table_id WHERE t.mode = 'casual';  -- must be 0
-- and no hand may be active: SELECT count(*) FROM card_hands WHERE status = 'active';                  -- must be 0
DROP TABLE IF EXISTS "ranked_matches";
DROP TABLE IF EXISTS "ranked_queue";
DROP TABLE IF EXISTS "card_hands";
DROP TABLE IF EXISTS "card_seats";
DROP TABLE IF EXISTS "card_tables";
-- Afterwards delete the 0009 row from drizzle.__drizzle_migrations so the migration can re-run.
