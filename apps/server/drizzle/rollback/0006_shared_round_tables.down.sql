-- Manual rollback for 0006_shared_round_tables (owner approval + backup first).
-- Refund any bets still "placed" BEFORE running this (see docs/MULTIPLAYER.md), otherwise stakes are lost.
DROP TABLE IF EXISTS "table_bets";
DROP TABLE IF EXISTS "table_rounds";
DROP TABLE IF EXISTS "game_tables";
