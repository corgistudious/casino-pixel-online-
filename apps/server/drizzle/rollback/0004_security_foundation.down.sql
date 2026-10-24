-- Manual rollback for 0004_security_foundation (run only with the owner's approval, after a backup).
-- It removes the guards and the idempotency table; role assignments made since stay in place.
-- Afterwards delete the 0004 row from drizzle.__drizzle_migrations so the migration can re-run.
DROP TRIGGER IF EXISTS "audit_logs_no_truncate" ON "audit_logs";
DROP TRIGGER IF EXISTS "audit_logs_append_only" ON "audit_logs";
DROP FUNCTION IF EXISTS "keyo_audit_append_only"();
DROP TRIGGER IF EXISTS "user_roles_owner_guard" ON "user_roles";
DROP FUNCTION IF EXISTS "keyo_owner_role_guard"();
DROP TRIGGER IF EXISTS "account_deletion_protected_guard" ON "account_deletion_requests";
DROP TRIGGER IF EXISTS "bans_protected_guard" ON "bans";
DROP FUNCTION IF EXISTS "keyo_protected_target_guard"();
DROP TRIGGER IF EXISTS "users_guard" ON "users";
DROP FUNCTION IF EXISTS "keyo_users_guard"();
DROP INDEX IF EXISTS "user_roles_single_owner_idx";
DROP TABLE IF EXISTS "admin_operations";
-- Re-create the old support role id if older code must run again:
INSERT INTO "roles" ("id", "name", "description", "system") VALUES ('support_agent', 'Support Agent', 'Support tickets and account help', true) ON CONFLICT DO NOTHING;
INSERT INTO "user_roles" ("user_id", "role_id", "granted_by", "granted_at") SELECT "user_id", 'support_agent', "granted_by", "granted_at" FROM "user_roles" WHERE "role_id" = 'support' ON CONFLICT DO NOTHING;
