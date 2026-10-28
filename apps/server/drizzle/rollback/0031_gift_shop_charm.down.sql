-- Manual rollback for 0031_gift_shop_charm (owner approval + backup first). This DELETES the gift
-- history and every player's Charm Points: export gift_transactions, charm_ledger and charm_points
-- before running it. Cxu spent on gifts stays in ledger_entries (wallet history is never changed).
ALTER TABLE profile_settings DROP COLUMN IF EXISTS show_gifts;
DROP TABLE IF EXISTS charm_ledger;
DROP TABLE IF EXISTS charm_points;
DROP TABLE IF EXISTS gift_transactions;
DROP TABLE IF EXISTS gift_catalog;
-- Afterwards delete the 0031 row from drizzle.__drizzle_migrations so the migration can re-run.
