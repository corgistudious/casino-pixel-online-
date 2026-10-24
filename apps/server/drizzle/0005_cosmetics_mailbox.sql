CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"size" integer NOT NULL,
	"animated" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name_vi" text NOT NULL,
	"name_en" text NOT NULL,
	"desc_vi" text,
	"desc_en" text,
	"rarity" text DEFAULT 'common' NOT NULL,
	"source" text DEFAULT 'shop' NOT NULL,
	"tradable" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"asset_id" text,
	"render" jsonb,
	"style" jsonb,
	"price_silver" bigint,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_items_kind" CHECK ("catalog_items"."kind" IN ('frame', 'avatar', 'collectible')),
	CONSTRAINT "catalog_items_status" CHECK ("catalog_items"."status" IN ('draft', 'released', 'hidden')),
	CONSTRAINT "catalog_items_price" CHECK ("catalog_items"."price_silver" IS NULL OR "catalog_items"."price_silver" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"attachments" jsonb NOT NULL,
	"target" jsonb NOT NULL,
	"recipients" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"batch_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"claim_result" jsonb,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "ref" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_item" text;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_batch_id_mail_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."mail_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_items_user_idx" ON "inventory_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "inventory_items_item_idx" ON "inventory_items" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_unique_cosmetic_idx" ON "inventory_items" USING btree ("user_id","item_id") WHERE "inventory_items"."kind" IN ('frame', 'avatar');--> statement-breakpoint
CREATE INDEX "mail_messages_user_idx" ON "mail_messages" USING btree ("user_id","created_at");--> statement-breakpoint
-- The six built-in frames become catalog items (drawn by the client, no image), keeping their ids and prices.
INSERT INTO "catalog_items" ("id", "kind", "name_vi", "name_en", "rarity", "source", "status", "style", "price_silver", "sort") VALUES
  ('classic', 'frame', 'Vàng Cổ Điển', 'Classic Gold', 'common', 'shop', 'released', '{"colors":["#fff1b8","#b9801c","#f7d77a","#8a5a12"],"animated":false}', 0, 10),
  ('silver', 'frame', 'Bạc Ánh Trăng', 'Moon Silver', 'common', 'shop', 'released', '{"colors":["#ffffff","#8d98b8","#e4e9f5","#4b5680"],"animated":false}', 5000, 20),
  ('emerald', 'frame', 'Ngọc Lục Bảo', 'Emerald', 'rare', 'shop', 'released', '{"colors":["#b8ffd6","#1f9d61","#7ff0a8","#0b5e31"],"animated":false}', 10000, 30),
  ('ruby', 'frame', 'Hồng Ngọc', 'Ruby', 'rare', 'shop', 'released', '{"colors":["#ffd1d8","#d42a44","#ff8a9a","#7d1222"],"animated":false}', 15000, 40),
  ('sapphire', 'frame', 'Lam Ngọc Rực Sáng', 'Sapphire Glow', 'epic', 'shop', 'released', '{"colors":["#d6f4ff","#2f5ee8","#5ad8ff","#162f87"],"animated":true}', 25000, 50),
  ('royal', 'frame', 'Cực Quang Hoàng Gia', 'Royal Aurora', 'legendary', 'shop', 'released', '{"colors":["#fff1b8","#b45cff","#f2c14e","#5ad8ff","#ff4fd8"],"animated":true}', 60000, 60)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
-- Existing frame ownership is copied into the inventory; user_items is kept unchanged as history.
INSERT INTO "inventory_items" ("user_id", "item_id", "kind", "source", "acquired_at")
  SELECT ui."user_id", ui."item_id", 'frame', 'legacy', ui."acquired_at"
  FROM "user_items" ui JOIN "catalog_items" c ON c."id" = ui."item_id"
ON CONFLICT DO NOTHING;
