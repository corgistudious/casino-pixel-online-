-- Shared Giftcode abuse counter. Additive only; no player/economy rows touched.
CREATE TABLE IF NOT EXISTS "giftcode_failure_limits" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "bucket" timestamptz NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  CONSTRAINT "giftcode_failure_limits_pk" PRIMARY KEY ("user_id", "bucket"),
  CONSTRAINT "giftcode_failure_limits_nonnegative" CHECK ("attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "giftcode_failure_limits_bucket_idx" ON "giftcode_failure_limits" ("bucket");
