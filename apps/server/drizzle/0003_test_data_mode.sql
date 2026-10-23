CREATE TABLE "environment_state" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"mode" text DEFAULT 'test' NOT NULL,
	"launched_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "environment_state_singleton" CHECK ("environment_state"."id" = 1),
	CONSTRAINT "environment_state_mode" CHECK ("environment_state"."mode" IN ('test', 'production'))
);
--> statement-breakpoint
CREATE TABLE "maintenance_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"dry_run" boolean NOT NULL,
	"operator" text NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"backup_path" text,
	"details" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
-- Accounts that exist before this migration are NOT treated as test data (nothing can be deleted by mistake).
ALTER TABLE "users" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "is_test" SET DEFAULT NULL;--> statement-breakpoint
CREATE INDEX "users_is_test_idx" ON "users" USING btree ("is_test") WHERE "users"."is_test";--> statement-breakpoint
-- A database starts in test mode. launch:production is the only way to change it.
INSERT INTO "environment_state" ("id", "mode") VALUES (1, 'test') ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
CREATE FUNCTION "keyo_environment_state_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'environment_state cannot be deleted';
  END IF;
  IF OLD.mode = 'production' AND NEW.mode <> 'production' THEN
    RAISE EXCEPTION 'a production database can never return to test mode';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "environment_state_guard" BEFORE UPDATE OR DELETE ON "environment_state" FOR EACH ROW EXECUTE FUNCTION "keyo_environment_state_guard"();--> statement-breakpoint
CREATE FUNCTION "keyo_users_set_is_test"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  current_mode text;
BEGIN
  SELECT "mode" INTO current_mode FROM "environment_state" WHERE "id" = 1;
  IF NEW.is_test IS NULL THEN
    NEW.is_test := coalesce(current_mode, 'test') = 'test';
  END IF;
  IF NEW.is_test AND current_mode = 'production' THEN
    RAISE EXCEPTION 'test accounts cannot be created in a production database';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "users_set_is_test" BEFORE INSERT OR UPDATE OF "is_test" ON "users" FOR EACH ROW EXECUTE FUNCTION "keyo_users_set_is_test"();