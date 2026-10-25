CREATE TABLE "giftcode_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"giftcode_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"mail_id" uuid,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "giftcodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"campaign" text NOT NULL,
	"attachments" jsonb NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"max_uses" integer,
	"per_user_limit" integer DEFAULT 1 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "giftcodes_limits" CHECK ("giftcodes"."per_user_limit" >= 1 AND ("giftcodes"."max_uses" IS NULL OR "giftcodes"."max_uses" >= 1) AND "giftcodes"."uses" >= 0 AND ("giftcodes"."max_uses" IS NULL OR "giftcodes"."uses" <= "giftcodes"."max_uses"))
);
--> statement-breakpoint
CREATE TABLE "reward_flags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"season_id" integer,
	"match_key" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_rewards" (
	"season_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"top_position" integer,
	"bracket" text NOT NULL,
	"attachments" jsonb NOT NULL,
	"silver" bigint NOT NULL,
	"gold" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"mail_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "season_rewards_season_id_user_id_pk" PRIMARY KEY("season_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "catalog_items" DROP CONSTRAINT "catalog_items_kind";--> statement-breakpoint
DROP INDEX "inventory_items_unique_cosmetic_idx";--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "player_ranks" ADD COLUMN "disqualified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "player_ranks" ADD COLUMN "disqualified_reason" text;--> statement-breakpoint
ALTER TABLE "rank_events" ADD COLUMN "opponent_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "rank_events" ADD COLUMN "reward_silver" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rank_seasons" ADD COLUMN "participation" jsonb DEFAULT '{"playSilver":0,"winSilver":0,"dailyMatchCap":20,"samePairDailyCap":3}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rank_seasons" ADD COLUMN "auto_rollover" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "equipped_title" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "equipped_bubble" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "equipped_card_back" text;--> statement-breakpoint
ALTER TABLE "giftcode_redemptions" ADD CONSTRAINT "giftcode_redemptions_giftcode_id_giftcodes_id_fk" FOREIGN KEY ("giftcode_id") REFERENCES "public"."giftcodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "giftcode_redemptions" ADD CONSTRAINT "giftcode_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_flags" ADD CONSTRAINT "reward_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_rewards" ADD CONSTRAINT "season_rewards_season_id_rank_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."rank_seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_rewards" ADD CONSTRAINT "season_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "giftcode_redemptions_once_idx" ON "giftcode_redemptions" USING btree ("giftcode_id","user_id","seq");--> statement-breakpoint
CREATE INDEX "giftcode_redemptions_user_idx" ON "giftcode_redemptions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "giftcodes_code_idx" ON "giftcodes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "giftcodes_campaign_idx" ON "giftcodes" USING btree ("campaign");--> statement-breakpoint
CREATE INDEX "reward_flags_created_idx" ON "reward_flags" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reward_flags_user_idx" ON "reward_flags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "season_rewards_pending_idx" ON "season_rewards" USING btree ("status") WHERE "season_rewards"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "inventory_items_expiry_idx" ON "inventory_items" USING btree ("expires_at") WHERE "inventory_items"."expires_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_unique_cosmetic_idx" ON "inventory_items" USING btree ("user_id","item_id") WHERE "inventory_items"."kind" IN ('frame', 'avatar', 'title', 'chat_bubble', 'card_back');--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_kind" CHECK ("catalog_items"."kind" IN ('frame', 'avatar', 'title', 'chat_bubble', 'card_back', 'collectible'));--> statement-breakpoint
-- ---------------------------------------------------------------- season reward records are immutable
-- Only the delivery bookkeeping may change (pending -> delivered, mail id, attempts, last error).
CREATE FUNCTION "keyo_season_rewards_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.season_id <> OLD.season_id OR NEW.user_id <> OLD.user_id OR NEW.bracket <> OLD.bracket
     OR NEW.top_position IS DISTINCT FROM OLD.top_position OR NEW.attachments <> OLD.attachments
     OR NEW.silver <> OLD.silver OR NEW.gold <> OLD.gold OR (OLD.status = 'delivered' AND NEW.status <> 'delivered') THEN
    RAISE EXCEPTION 'season_rewards records are immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "season_rewards_immutable" BEFORE UPDATE ON "season_rewards" FOR EACH ROW EXECUTE FUNCTION "keyo_season_rewards_guard"();--> statement-breakpoint
-- Seasons created before this release used tier/top rewards: switch them to the official brackets.
UPDATE "rank_seasons" SET "rewards" = '{"brackets":{"top1":[{"type":"silver","amount":3000000},{"type":"gold","amount":3000},{"type":"item","itemId":"vuong_gia_card_back","durationDays":60},{"type":"item","itemId":"vuong_gia_frame","durationDays":60},{"type":"item","itemId":"vuong_gia_bubble","durationDays":60},{"type":"item","itemId":"vuong_gia_avatar","durationDays":60}],"top2":[{"type":"silver","amount":2000000},{"type":"gold","amount":2000},{"type":"item","itemId":"vuong_gia_card_back","durationDays":60},{"type":"item","itemId":"vuong_gia_frame","durationDays":60},{"type":"item","itemId":"vuong_gia_bubble","durationDays":60},{"type":"item","itemId":"vuong_gia_avatar","durationDays":60}],"top3":[{"type":"silver","amount":1000000},{"type":"gold","amount":1000},{"type":"item","itemId":"vuong_gia_card_back","durationDays":60},{"type":"item","itemId":"vuong_gia_frame","durationDays":60},{"type":"item","itemId":"vuong_gia_bubble","durationDays":60},{"type":"item","itemId":"vuong_gia_avatar","durationDays":60}],"top4_10":[{"type":"silver","amount":500000},{"type":"gold","amount":500}],"top11_50":[{"type":"silver","amount":300000}],"rest":[{"type":"silver","amount":200000}]}}'::jsonb
  WHERE NOT ("rewards" ? 'brackets') AND "status" <> 'ended';--> statement-breakpoint
-- ---------------------------------------------------------------- official cosmetics
-- The exclusive 60-day Vương Giả set (drawn by the client: style.art = 'vuong_gia'), never tradable or sold,
-- plus starter titles, chat bubbles and card backs for the shop.
INSERT INTO "catalog_items" ("id", "kind", "name_vi", "name_en", "desc_vi", "desc_en", "rarity", "source", "tradable", "status", "style", "price_silver", "sort") VALUES
  ('vuong_gia_card_back', 'card_back', 'Mặt Bài Vương Giả', 'Sovereign Card Back', 'Mặt lưng lá bài độc quyền dành cho Top 1–3 mùa giải. Hiệu lực 60 ngày.', 'Exclusive card back for the season Top 1–3. Valid for 60 days.', 'mythic', 'season', false, 'released', '{"colors":["#fff1b8","#f2c14e","#b5132c","#3b0a1a"],"animated":true,"art":"vuong_gia"}', NULL, 900),
  ('vuong_gia_frame', 'frame', 'Khung Vương Giả', 'Sovereign Frame', 'Khung hồ sơ độc quyền dành cho Top 1–3 mùa giải. Hiệu lực 60 ngày.', 'Exclusive profile frame for the season Top 1–3. Valid for 60 days.', 'mythic', 'season', false, 'released', '{"colors":["#fff1b8","#ff4fd8","#f2c14e","#b5132c","#ffe08a"],"animated":true,"art":"vuong_gia"}', NULL, 900),
  ('vuong_gia_bubble', 'chat_bubble', 'Bong Bóng Chat Vương Giả', 'Sovereign Chat Bubble', 'Bong bóng chat độc quyền dành cho Top 1–3 mùa giải. Hiệu lực 60 ngày.', 'Exclusive chat bubble for the season Top 1–3. Valid for 60 days.', 'mythic', 'season', false, 'released', '{"colors":["#3b0a1a","#7a1030","#f2c14e","#fff1b8"],"animated":true,"art":"vuong_gia"}', NULL, 900),
  ('vuong_gia_avatar', 'avatar', 'Avatar Vương Giả', 'Sovereign Avatar', 'Avatar độc quyền dành cho Top 1–3 mùa giải. Hiệu lực 60 ngày.', 'Exclusive avatar for the season Top 1–3. Valid for 60 days.', 'mythic', 'season', false, 'released', '{"colors":["#fff1b8","#f2c14e","#b5132c","#2a0613"],"animated":true,"art":"vuong_gia"}', NULL, 900),
  ('title_newcomer', 'title', 'Tân Binh', 'Rookie', 'Danh hiệu khởi đầu.', 'A starter title.', 'common', 'shop', false, 'released', '{"colors":["#d6f4ff","#5aa8ff"],"animated":false}', 0, 10),
  ('title_high_roller', 'title', 'Đại Gia', 'High Roller', NULL, NULL, 'rare', 'shop', false, 'released', '{"colors":["#fff1b8","#f2c14e"],"animated":false}', 20000, 20),
  ('title_lucky_star', 'title', 'Ngôi Sao May Mắn', 'Lucky Star', NULL, NULL, 'epic', 'shop', false, 'released', '{"colors":["#ffe6ff","#b45cff","#ff4fd8"],"animated":true}', 50000, 30),
  ('bubble_classic', 'chat_bubble', 'Bong Bóng Cổ Điển', 'Classic Bubble', NULL, NULL, 'common', 'shop', false, 'released', '{"colors":["#272048","#3a3166"],"animated":false}', 0, 10),
  ('bubble_emerald', 'chat_bubble', 'Bong Bóng Lục Bảo', 'Emerald Bubble', NULL, NULL, 'rare', 'shop', false, 'released', '{"colors":["#0b4128","#1f9d61","#b8ffd6"],"animated":false}', 8000, 20),
  ('bubble_neon', 'chat_bubble', 'Bong Bóng Neon', 'Neon Bubble', NULL, NULL, 'epic', 'shop', false, 'released', '{"colors":["#2a0b4f","#b45cff","#5ad8ff"],"animated":true}', 25000, 30),
  ('card_back_classic', 'card_back', 'Mặt Bài Cổ Điển', 'Classic Card Back', NULL, NULL, 'common', 'shop', false, 'released', '{"colors":["#7d1222","#d42a44","#f7d77a"],"animated":false}', 0, 10),
  ('card_back_sapphire', 'card_back', 'Mặt Bài Lam Ngọc', 'Sapphire Card Back', NULL, NULL, 'rare', 'shop', false, 'released', '{"colors":["#162f87","#2f5ee8","#d6f4ff"],"animated":false}', 12000, 20),
  ('card_back_jade', 'card_back', 'Mặt Bài Ngọc Bích', 'Jade Card Back', NULL, NULL, 'epic', 'shop', false, 'released', '{"colors":["#062a1b","#1f9d61","#fff1b8"],"animated":true}', 30000, 30)
ON CONFLICT ("id") DO NOTHING;
