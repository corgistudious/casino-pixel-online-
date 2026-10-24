CREATE TABLE "admin_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"request_hash" text NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_single_owner_idx" ON "user_roles" USING btree ("role_id") WHERE "user_roles"."role_id" = 'owner';--> statement-breakpoint
-- ---------------------------------------------------------------- roles (data kept, assignments moved)
INSERT INTO "roles" ("id", "name", "description", "system") VALUES
  ('owner', 'Owner', 'Keyo GM (UID 1002)', true),
  ('support', 'Support', 'Answers and routes support tickets', true)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
-- "support_agent" becomes the built-in "support" role; every assignment is carried over.
INSERT INTO "user_roles" ("user_id", "role_id", "granted_by", "granted_at")
  SELECT "user_id", 'support', "granted_by", "granted_at" FROM "user_roles" WHERE "role_id" = 'support_agent'
ON CONFLICT DO NOTHING;--> statement-breakpoint
DELETE FROM "user_roles" WHERE "role_id" = 'support_agent';--> statement-breakpoint
DELETE FROM "roles" WHERE "id" = 'support_agent';--> statement-breakpoint
-- "finance" stays as a custom read-only role: only Owner and Super Admin may change balances.
UPDATE "roles" SET "system" = false, "description" = 'Legacy: read-only economy review' WHERE "id" = 'finance';--> statement-breakpoint
DELETE FROM "role_permissions" WHERE "role_id" = 'finance' AND "permission" NOT IN ('admin.access', 'dashboard.read', 'users.read', 'economy.read', 'bank.read', 'audit.read');--> statement-breakpoint
-- Permission names that no longer exist (replaced by staff.manage / chat.moderate).
DELETE FROM "role_permissions" WHERE "permission" IN ('roles.manage', 'content.moderate', 'users.manage');--> statement-breakpoint
-- ---------------------------------------------------------------- protected accounts
-- Keyo Support (1000) and the Owner (1002) are never test data, whatever mode they were created in.
UPDATE "users" SET "is_test" = false WHERE "uid" IN (1000, 1002) AND "is_test";--> statement-breakpoint
INSERT INTO "user_roles" ("user_id", "role_id")
  SELECT "id", 'owner' FROM "users" WHERE "uid" = 1002 AND "account_type" = 'player' AND "status" <> 'deleted'
ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "keyo_users_set_is_test"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  current_mode text;
BEGIN
  SELECT "mode" INTO current_mode FROM "environment_state" WHERE "id" = 1;
  IF NEW.uid IN (1000, 1002) THEN
    NEW.is_test := false;
  ELSIF NEW.is_test IS NULL THEN
    NEW.is_test := coalesce(current_mode, 'test') = 'test';
  END IF;
  IF NEW.is_test AND current_mode = 'production' THEN
    RAISE EXCEPTION 'test accounts cannot be created in a production database';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "keyo_users_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.uid IN (1000, 1002) THEN
      RAISE EXCEPTION 'protected_account: UID % cannot be deleted', OLD.uid;
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.uid <> OLD.uid THEN
    RAISE EXCEPTION 'UIDs are permanent (tried % -> %)', OLD.uid, NEW.uid;
  END IF;
  IF OLD.uid IN (1000, 1002) THEN
    IF NEW.account_type <> OLD.account_type THEN
      RAISE EXCEPTION 'protected_account: UID % account type cannot change', OLD.uid;
    END IF;
    IF NEW.status IN ('deleted', 'restricted') OR NEW.deleted_at IS NOT NULL OR NEW.is_test THEN
      RAISE EXCEPTION 'protected_account: UID % cannot be deleted, restricted or marked as test', OLD.uid;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "users_guard" BEFORE UPDATE OR DELETE ON "users" FOR EACH ROW EXECUTE FUNCTION "keyo_users_guard"();--> statement-breakpoint
CREATE FUNCTION "keyo_protected_target_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "id" = NEW.user_id AND "uid" IN (1000, 1002)) THEN
    RAISE EXCEPTION 'protected_account: % cannot target a protected account', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "bans_protected_guard" BEFORE INSERT ON "bans" FOR EACH ROW EXECUTE FUNCTION "keyo_protected_target_guard"();--> statement-breakpoint
CREATE TRIGGER "account_deletion_protected_guard" BEFORE INSERT ON "account_deletion_requests" FOR EACH ROW EXECUTE FUNCTION "keyo_protected_target_guard"();--> statement-breakpoint
CREATE FUNCTION "keyo_owner_role_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
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
$$;--> statement-breakpoint
CREATE TRIGGER "user_roles_owner_guard" BEFORE INSERT OR UPDATE OR DELETE ON "user_roles" FOR EACH ROW EXECUTE FUNCTION "keyo_owner_role_guard"();--> statement-breakpoint
-- ---------------------------------------------------------------- audit log is append-only
CREATE FUNCTION "keyo_audit_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_logs_append_only" BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION "keyo_audit_append_only"();--> statement-breakpoint
CREATE TRIGGER "audit_logs_no_truncate" BEFORE TRUNCATE ON "audit_logs" FOR EACH STATEMENT EXECUTE FUNCTION "keyo_audit_append_only"();
