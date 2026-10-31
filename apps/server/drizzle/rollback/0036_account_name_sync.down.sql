-- Manual rollback for 0036_account_name_sync (Owner approval + backup first). Removes only the
-- backstop trigger; no account data is changed. Afterwards delete the 0036 row from
-- drizzle.__drizzle_migrations.
BEGIN;
DROP TRIGGER IF EXISTS users_name_sync ON users;
DROP FUNCTION IF EXISTS keyo_users_name_sync();
COMMIT;
