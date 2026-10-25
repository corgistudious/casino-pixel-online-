CREATE TABLE IF NOT EXISTS market_listings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 seller_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 buyer_id uuid REFERENCES users(id) ON DELETE RESTRICT,
 instance_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
 item_id text NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
 price_silver bigint NOT NULL CHECK (price_silver > 0),
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS market_active_instance_idx ON market_listings(instance_id) WHERE status = 'active';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS market_operations (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 listing_id uuid NOT NULL REFERENCES market_listings(id) ON DELETE RESTRICT,
 kind text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
