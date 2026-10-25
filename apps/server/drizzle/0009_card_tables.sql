CREATE TABLE "card_hands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" text NOT NULL,
	"seq" integer NOT NULL,
	"state" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"server_seed" text NOT NULL,
	"seed_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"deadline" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "card_seats" (
	"table_id" text NOT NULL,
	"seat" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"stack" bigint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_seats_table_id_seat_pk" PRIMARY KEY("table_id","seat"),
	CONSTRAINT "card_seats_stack_nonnegative" CHECK ("card_seats"."stack" >= 0)
);
--> statement-breakpoint
CREATE TABLE "card_tables" (
	"id" text PRIMARY KEY NOT NULL,
	"game" text NOT NULL,
	"name_vi" text NOT NULL,
	"name_en" text NOT NULL,
	"config" jsonb NOT NULL,
	"mode" text DEFAULT 'casual' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"button" integer DEFAULT 0 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ranked_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game" text NOT NULL,
	"table_id" text NOT NULL,
	"season_id" integer NOT NULL,
	"players" uuid[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"winner_id" uuid,
	"forfeit_id" uuid,
	"hands" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ranked_queue" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"game" text NOT NULL,
	"division" integer NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_hands" ADD CONSTRAINT "card_hands_table_id_card_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."card_tables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_seats" ADD CONSTRAINT "card_seats_table_id_card_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."card_tables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_seats" ADD CONSTRAINT "card_seats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranked_matches" ADD CONSTRAINT "ranked_matches_table_id_card_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."card_tables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranked_queue" ADD CONSTRAINT "ranked_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_hands_table_seq_idx" ON "card_hands" USING btree ("table_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "card_hands_one_active_idx" ON "card_hands" USING btree ("table_id") WHERE "card_hands"."status" = 'active';--> statement-breakpoint
CREATE INDEX "card_hands_deadline_idx" ON "card_hands" USING btree ("deadline") WHERE "card_hands"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "card_seats_table_user_idx" ON "card_seats" USING btree ("table_id","user_id");--> statement-breakpoint
CREATE INDEX "card_seats_user_idx" ON "card_seats" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ranked_matches_status_idx" ON "ranked_matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ranked_matches_table_idx" ON "ranked_matches" USING btree ("table_id");--> statement-breakpoint
-- Casual tables (Cxu Bạc buy-in). Ranked tables are created per match by the matchmaker.
INSERT INTO "card_tables" ("id", "game", "name_vi", "name_en", "config", "sort") VALUES
  ('poker-1', 'poker', 'Poker Hold''em 50/100', 'Hold''em 50/100', '{"smallBlind":50,"bigBlind":100,"ante":0,"minBuyIn":2000,"maxBuyIn":20000,"seats":6,"turnMs":20000}', 10),
  ('poker-2', 'poker', 'Poker Hold''em 500/1K', 'Hold''em 500/1K', '{"smallBlind":500,"bigBlind":1000,"ante":0,"minBuyIn":20000,"maxBuyIn":200000,"seats":6,"turnMs":20000}', 11),
  ('lieng-1', 'lieng', 'Liêng 100', 'Liêng 100', '{"smallBlind":0,"bigBlind":100,"ante":100,"minBuyIn":2000,"maxBuyIn":20000,"seats":6,"turnMs":20000}', 20),
  ('xito-1', 'xito', 'Xì Tố 100', 'Xì Tố 100', '{"smallBlind":0,"bigBlind":100,"ante":50,"minBuyIn":2000,"maxBuyIn":20000,"seats":5,"turnMs":20000}', 30)
ON CONFLICT ("id") DO NOTHING;
