-- Manual rollback for 0020_social_upgrade (owner approval + backup first).
-- Gift history and guild logs/invites created after the upgrade are dropped; balances and items are not
-- touched (completed gifts stay where they were delivered). Guild names must be unique again first:
--   SELECT name, count(*) FROM guilds GROUP BY name HAVING count(*) > 1;   -- must return nothing
DROP INDEX IF EXISTS direct_messages_unread_idx;
DROP TABLE IF EXISTS gift_transfers;
DROP TABLE IF EXISTS guild_log;
DROP TABLE IF EXISTS guild_invites;
DROP INDEX IF EXISTS guilds_active_name_idx;
ALTER TABLE guilds ADD CONSTRAINT guilds_name_key UNIQUE (name);
ALTER TABLE guilds DROP COLUMN IF EXISTS disbanded_at, DROP COLUMN IF EXISTS max_members, DROP COLUMN IF EXISTS join_policy,
  DROP COLUMN IF EXISTS color, DROP COLUMN IF EXISTS emblem, DROP COLUMN IF EXISTS description;
CREATE TRIGGER keyo_attach_support_on_signup AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION keyo_attach_support();
-- Afterwards delete the 0020 row from drizzle.__drizzle_migrations so the migration can re-run.
