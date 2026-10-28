-- Gift Shop and Charm Points (Điểm Hấp Dẫn). Additive. No gift is created here: the catalogue is
-- filled from the admin panel once the Owner approves prices (nothing is on sale by default).
-- Gifts are consumed when sent (they never become inventory items, cannot be resold or passed on).
CREATE TABLE IF NOT EXISTS gift_catalog (
 id text PRIMARY KEY CHECK (id ~ '^[a-z0-9_]{2,40}$'),
 category text NOT NULL CHECK (category IN ('common', 'friendship', 'romantic', 'premium', 'event', 'limited')),
 name_vi text NOT NULL CHECK (char_length(name_vi) BETWEEN 1 AND 40),
 name_en text NOT NULL CHECK (char_length(name_en) BETWEEN 1 AND 40),
 desc_vi text NOT NULL DEFAULT '' CHECK (char_length(desc_vi) <= 300),
 desc_en text NOT NULL DEFAULT '' CHECK (char_length(desc_en) <= 300),
 icon text NOT NULL CHECK (char_length(icon) BETWEEN 1 AND 40),
 icon_asset text REFERENCES assets(id) ON DELETE SET NULL,
 rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary', 'mythic')),
 price bigint NOT NULL CHECK (price BETWEEN 1 AND 100000000),
 currency text NOT NULL DEFAULT 'silver' CHECK (currency IN ('silver', 'gold')),
 charm integer NOT NULL CHECK (charm BETWEEN 1 AND 10000000),
 on_sale boolean NOT NULL DEFAULT false,
 -- Per sender per server day (UTC); NULL = only the global limits apply.
 daily_limit integer CHECK (daily_limit IS NULL OR daily_limit BETWEEN 1 AND 1000),
 starts_at timestamptz,
 ends_at timestamptz,
 sort integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
 CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
--> statement-breakpoint
-- One row per gift sent. The id is the client's idempotency key; price and charm are copied at
-- send time so later price changes never rewrite history.
CREATE TABLE IF NOT EXISTS gift_transactions (
 id uuid PRIMARY KEY,
 sender_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 receiver_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 gift_id text NOT NULL REFERENCES gift_catalog(id) ON DELETE RESTRICT,
 quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
 unit_price bigint NOT NULL CHECK (unit_price > 0),
 total_price bigint NOT NULL CHECK (total_price = unit_price * quantity),
 currency text NOT NULL CHECK (currency IN ('silver', 'gold')),
 charm integer NOT NULL CHECK (charm > 0),
 anonymous boolean NOT NULL DEFAULT false,
 message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 140),
 status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'reversed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 reversed_at timestamptz,
 reversed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 reverse_reason text,
 refunded boolean NOT NULL DEFAULT false,
 CHECK (sender_id <> receiver_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS gift_tx_receiver_idx ON gift_transactions(receiver_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS gift_tx_sender_idx ON gift_transactions(sender_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS gift_tx_gift_idx ON gift_transactions(gift_id, created_at DESC);
--> statement-breakpoint
-- Current Charm Points per player (only ever changed together with a charm_ledger row).
CREATE TABLE IF NOT EXISTS charm_points (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
 total bigint NOT NULL DEFAULT 0 CHECK (total >= 0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS charm_points_total_idx ON charm_points(total DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS charm_ledger (
 id bigserial PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 delta bigint NOT NULL CHECK (delta <> 0),
 total_after bigint NOT NULL CHECK (total_after >= 0),
 reason text NOT NULL CHECK (reason IN ('gift', 'gift_reversal', 'admin_adjust')),
 gift_tx_id uuid REFERENCES gift_transactions(id) ON DELETE SET NULL,
 actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 note text,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- A gift adds charm once and is reversed at most once.
CREATE UNIQUE INDEX IF NOT EXISTS charm_ledger_gift_once ON charm_ledger(gift_tx_id, reason) WHERE gift_tx_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS charm_ledger_user_idx ON charm_ledger(user_id, created_at DESC);
--> statement-breakpoint
-- Players can hide their received-gift showcase (Charm Points stay visible, like follower counts).
ALTER TABLE profile_settings ADD COLUMN IF NOT EXISTS show_gifts boolean NOT NULL DEFAULT true;
