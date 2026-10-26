-- Additive production-safe schema. No existing account or wallet data is reset.
CREATE TABLE IF NOT EXISTS friendships (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  friend_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,friend_id), CHECK (user_id <> friend_id)
);
CREATE TABLE IF NOT EXISTS friend_requests (
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  receiver_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(sender_id,receiver_id), CHECK(sender_id <> receiver_id)
);
CREATE TABLE IF NOT EXISTS direct_messages (
  id bigserial PRIMARY KEY, sender_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  receiver_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body varchar(500) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS direct_messages_conversation ON direct_messages(sender_id,receiver_id,id DESC);
CREATE TABLE IF NOT EXISTS guilds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(40) NOT NULL UNIQUE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  points bigint NOT NULL DEFAULT 0 CHECK (points >= 0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS guild_members (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE RESTRICT,
  role varchar(12) NOT NULL CHECK(role IN ('owner','officer','member')),
  joined_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guild_members_guild ON guild_members(guild_id);
CREATE TABLE IF NOT EXISTS guild_messages (
  id bigserial PRIMARY KEY, guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body varchar(500) NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guild_messages_latest ON guild_messages(guild_id,id DESC);
CREATE TABLE IF NOT EXISTS guild_win_events (
  ledger_id bigint PRIMARY KEY, guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  points integer NOT NULL CHECK(points > 0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quest_claims (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  quest_id varchar(40) NOT NULL, period_key varchar(16) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,quest_id,period_key)
);
-- Default support contact for every existing player. No DM access to UID 1000.
INSERT INTO friendships(user_id,friend_id)
SELECT u.id,s.id FROM users u CROSS JOIN users s
WHERE u.account_type = 'player' AND u.id <> s.id AND s.uid = 1000
ON CONFLICT DO NOTHING;
-- Automatically attach Keyo Support to new regular players.
CREATE OR REPLACE FUNCTION keyo_attach_support() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.account_type = 'player' AND NEW.uid <> 1000 THEN
  INSERT INTO friendships(user_id,friend_id)
  SELECT NEW.id,id FROM users WHERE uid=1000 ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS keyo_attach_support_on_signup ON users;
CREATE TRIGGER keyo_attach_support_on_signup AFTER INSERT ON users
FOR EACH ROW EXECUTE FUNCTION keyo_attach_support();
-- Only real positive payout ledger rows generate guild activity, once per ledger ID.
CREATE OR REPLACE FUNCTION keyo_guild_win_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE member_guild uuid; awarded integer;
BEGIN
 IF NEW.reason <> 'payout' OR NEW.delta <= 0 OR NEW.currency <> 'silver' THEN RETURN NEW; END IF;
 SELECT guild_id INTO member_guild FROM guild_members WHERE user_id=NEW.user_id;
 IF member_guild IS NULL THEN RETURN NEW; END IF;
 awarded := LEAST(100, GREATEST(1, FLOOR(NEW.delta / 1000.0)::integer));
 INSERT INTO guild_win_events(ledger_id,guild_id,user_id,points) VALUES(NEW.id,member_guild,NEW.user_id,awarded)
 ON CONFLICT DO NOTHING;
 IF FOUND THEN UPDATE guilds SET points=points+awarded WHERE id=member_guild; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS keyo_guild_win_on_payout ON ledger_entries;
CREATE TRIGGER keyo_guild_win_on_payout AFTER INSERT ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION keyo_guild_win_activity();
