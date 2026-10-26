-- Friends, gifts, guild management and chat upgrade. Additive: no player, wallet, item or guild row is removed.
-- Keyo Support (UID 1000) is no longer attached to new players as a "friend". Existing rows are kept
-- (support history stays intact) and the API simply never lists UID 1000 as a friend.
DROP TRIGGER IF EXISTS keyo_attach_support_on_signup ON users;
--> statement-breakpoint
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS description varchar(200) NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS emblem varchar(24) NOT NULL DEFAULT 'crown';
--> statement-breakpoint
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS color varchar(16) NOT NULL DEFAULT 'gold';
--> statement-breakpoint
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS join_policy varchar(8) NOT NULL DEFAULT 'open' CHECK (join_policy IN ('open', 'invite'));
--> statement-breakpoint
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS max_members integer NOT NULL DEFAULT 50 CHECK (max_members BETWEEN 5 AND 200);
--> statement-breakpoint
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS disbanded_at timestamptz;
--> statement-breakpoint
-- A disbanded guild keeps its row and history; only active guilds need unique names.
ALTER TABLE guilds DROP CONSTRAINT IF EXISTS guilds_name_key;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS guilds_active_name_idx ON guilds (name) WHERE disbanded_at IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS guild_invites (
 guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 invited_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (guild_id, user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS guild_invites_user_idx ON guild_invites(user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS guild_log (
 id bigserial PRIMARY KEY,
 guild_id uuid NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
 action varchar(24) NOT NULL,
 target_id uuid REFERENCES users(id) ON DELETE RESTRICT,
 details jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS guild_log_guild_idx ON guild_log(guild_id, id DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS gift_transfers (
 id uuid PRIMARY KEY,
 sender_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 receiver_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 kind varchar(8) NOT NULL CHECK (kind IN ('silver', 'item')),
 amount bigint NOT NULL CHECK (amount > 0),
 item_instance_id uuid REFERENCES inventory_items(id) ON DELETE RESTRICT,
 item_id text REFERENCES catalog_items(id) ON DELETE RESTRICT,
 message varchar(140) NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (sender_id <> receiver_id),
 CHECK ((kind = 'item') = (item_instance_id IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS gift_transfers_sender_idx ON gift_transfers(sender_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS gift_transfers_receiver_idx ON gift_transfers(receiver_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS direct_messages_unread_idx ON direct_messages(receiver_id, sender_id) WHERE read_at IS NULL;
