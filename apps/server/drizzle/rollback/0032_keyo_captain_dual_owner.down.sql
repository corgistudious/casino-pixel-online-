-- Manual rollback for 0032_keyo_captain_dual_owner (owner approval + backup first).
-- 1. Remove UID 1000's Owner role. The guard forbids removing an Owner role, so it is switched off
--    for this one statement only, inside the same transaction.
BEGIN;
ALTER TABLE user_roles DISABLE TRIGGER user_roles_owner_guard;
DELETE FROM user_roles ur USING users u WHERE ur.user_id = u.id AND u.uid = 1000 AND ur.role_id = 'owner';
ALTER TABLE user_roles ENABLE TRIGGER user_roles_owner_guard;
-- 2. Back to "only UID 1002" and a single Owner.
CREATE OR REPLACE FUNCTION "keyo_owner_role_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.role_id = 'owner' THEN
    RAISE EXCEPTION 'protected_account: the Owner role cannot be removed or moved';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.role_id = 'owner'
     AND NOT EXISTS (SELECT 1 FROM "users" WHERE "id" = NEW.user_id AND "uid" = 1002) THEN
    RAISE EXCEPTION 'protected_account: only UID 1002 can hold the Owner role';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
CREATE UNIQUE INDEX IF NOT EXISTS "user_roles_single_owner_idx" ON "user_roles" USING btree ("role_id") WHERE "user_roles"."role_id" = 'owner';
-- 3. Tables/columns added by 0032 (ticket client keys are only used for retries).
DROP INDEX IF EXISTS support_tickets_client_key_idx;
ALTER TABLE support_tickets DROP COLUMN IF EXISTS client_key;
DROP TABLE IF EXISTS account_setup_tokens;
UPDATE users SET display_name = 'Keyo Support' WHERE uid = 1000 AND display_name = 'Keyo Captain';
COMMIT;
-- UID 1000 keeps any password set meanwhile; the previous release refuses its sign-in anyway.
-- Afterwards delete the 0032 row from drizzle.__drizzle_migrations so the migration can re-run.
