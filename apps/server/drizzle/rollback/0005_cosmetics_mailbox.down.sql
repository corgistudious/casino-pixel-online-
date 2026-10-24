-- Manual rollback for 0005_cosmetics_mailbox (owner approval + backup first).
-- Frame ownership created before 0005 is still in user_items. Ownership, mail and uploaded
-- images created after 0005 are lost by this rollback, so export them first if needed.
ALTER TABLE "users" DROP COLUMN IF EXISTS "avatar_item";
ALTER TABLE "ledger_entries" DROP COLUMN IF EXISTS "ref";
DROP TABLE IF EXISTS "mail_messages";
DROP TABLE IF EXISTS "mail_batches";
DROP TABLE IF EXISTS "inventory_items";
DROP TABLE IF EXISTS "catalog_items";
DROP TABLE IF EXISTS "assets";
