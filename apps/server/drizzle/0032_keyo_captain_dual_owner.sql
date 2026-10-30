-- Keyo Captain (UID 1000) becomes the second Owner and can sign in once a password is set through
-- a one-time link. Additive except for the Owner rule: the role may now be held by UID 1000 or
-- UID 1002 (still nobody else), and it still can never be removed or moved by any statement.
-- No account is created, deleted or re-created; no balance, history or other role is touched.
DROP INDEX IF EXISTS "user_roles_single_owner_idx";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "keyo_owner_role_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.role_id = 'owner' THEN
    RAISE EXCEPTION 'protected_account: the Owner role cannot be removed or moved';
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.role_id = 'owner'
     AND NOT EXISTS (SELECT 1 FROM "users" WHERE "id" = NEW.user_id AND "uid" IN (1000, 1002)) THEN
    RAISE EXCEPTION 'protected_account: only UID 1000 and UID 1002 can hold the Owner role';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Public name only; the technical username (keyo_support) stays for compatibility. A name an
-- operator already changed by hand is left alone.
UPDATE "users" SET "display_name" = 'Keyo Captain' WHERE "uid" = 1000 AND "display_name" = 'Keyo Support';
--> statement-breakpoint
-- One-time password set-up links for a protected account that has no usable password yet. Only
-- the SHA-256 of the token is stored; a link expires after 30 minutes and works once.
CREATE TABLE IF NOT EXISTS account_setup_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 token_hash text NOT NULL UNIQUE,
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 used_at timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS account_setup_tokens_user_idx ON account_setup_tokens(user_id, created_at DESC);
--> statement-breakpoint
-- A retried "create ticket" with the same client key returns the first ticket instead of a copy.
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS client_key uuid;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_client_key_idx ON support_tickets(user_id, client_key) WHERE client_key IS NOT NULL;
