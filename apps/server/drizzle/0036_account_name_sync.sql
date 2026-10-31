-- One account name per player: the display name and the username (shown as @name) are the same
-- value. The application writes both together; this trigger is the backstop for every write path
-- (API, admin tools, maintenance scripts): any INSERT, or any UPDATE that touches the name, of a
-- live player account must leave username = display_name. username_lower always follows username.
--
-- Existing accounts are NOT changed: rows whose two names already differ keep working (sign-in,
-- wallet, equipment and every other update are unaffected) until their name is written again.
-- Deleted (anonymised) accounts and system accounts (Keyo Captain, UID 1000) are exempt.
CREATE OR REPLACE FUNCTION keyo_users_name_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.username_lower := lower(NEW.username);
  IF NEW.account_type = 'player' AND NEW.status <> 'deleted'
     AND (TG_OP = 'INSERT' OR NEW.username IS DISTINCT FROM OLD.username OR NEW.display_name IS DISTINCT FROM OLD.display_name)
     AND NEW.display_name IS DISTINCT FROM NEW.username THEN
    RAISE EXCEPTION 'name_out_of_sync: a player''s display name and username must be the same'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'users_name_sync';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS users_name_sync ON users;
--> statement-breakpoint
CREATE TRIGGER users_name_sync BEFORE INSERT OR UPDATE OF username, username_lower, display_name ON users
  FOR EACH ROW EXECUTE FUNCTION keyo_users_name_sync();
