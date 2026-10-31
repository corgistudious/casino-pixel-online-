-- Manual rollback for 0037_account_name_sync (Owner approval + backup first). Removes only the
-- backstop trigger; no account data is changed. Afterwards delete the 0037_account_name_sync row (its hash) from
-- drizzle.__drizzle_migrations.
BEGIN;
DROP TRIGGER IF EXISTS users_name_sync ON users;
DROP FUNCTION IF EXISTS keyo_users_name_sync();
COMMIT;
