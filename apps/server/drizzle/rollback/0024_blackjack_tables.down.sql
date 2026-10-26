-- Manual rollback for 0024_blackjack_tables (owner approval + backup first).
-- No round may be running: SELECT count(*) FROM bj_rounds WHERE status = 'active';  -- must be 0
-- Every stake and payout is in the ledger and game_rounds, which are kept.
DROP TABLE IF EXISTS bj_rounds;
DROP TABLE IF EXISTS bj_seats;
DROP TABLE IF EXISTS bj_tables;
-- Afterwards delete the 0024 row from drizzle.__drizzle_migrations so the migration can re-run.
