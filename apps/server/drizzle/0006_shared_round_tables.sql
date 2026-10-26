CREATE TABLE "game_tables" (
	"id" text PRIMARY KEY NOT NULL,
	"game" text NOT NULL,
	"name_vi" text NOT NULL,
	"name_en" text NOT NULL,
	"config" jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_bets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" integer,
	"amount" bigint NOT NULL,
	"payout" bigint,
	"status" text DEFAULT 'placed' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_bets_amount_positive" CHECK ("table_bets"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "table_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" text NOT NULL,
	"seq" integer NOT NULL,
	"status" text DEFAULT 'betting' NOT NULL,
	"server_seed" text NOT NULL,
	"seed_hash" text NOT NULL,
	"outcome" jsonb,
	"opens_at" timestamp with time zone NOT NULL,
	"bets_open_at" timestamp with time zone NOT NULL,
	"locks_at" timestamp with time zone NOT NULL,
	"reveal_at" timestamp with time zone NOT NULL,
	"next_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "table_bets" ADD CONSTRAINT "table_bets_round_id_table_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."table_rounds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_bets" ADD CONSTRAINT "table_bets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_rounds" ADD CONSTRAINT "table_rounds_table_id_game_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."game_tables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "table_bets_round_idx" ON "table_bets" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "table_bets_user_idx" ON "table_bets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "table_bets_idempotency_idx" ON "table_bets" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "table_rounds_table_seq_idx" ON "table_rounds" USING btree ("table_id","seq");--> statement-breakpoint
CREATE INDEX "table_rounds_status_idx" ON "table_rounds" USING btree ("status");--> statement-breakpoint
-- Default tables (staff can add more rows to game_tables).
INSERT INTO "game_tables" ("id", "game", "name_vi", "name_en", "config", "sort") VALUES
  ('taixiu-1', 'taixiu', 'Tài Xỉu Hoàng Gia', 'Royal Tài Xỉu', '{"minBet":10,"maxBet":100000,"timings":{"shakeMs":3000,"betMs":30000,"revealMs":4000,"breakMs":5000}}', 10),
  ('roulette-1', 'roulette', 'Roulette Châu Âu', 'European Roulette', '{"minBet":10,"maxBet":100000,"timings":{"shakeMs":0,"betMs":25000,"revealMs":15000,"breakMs":5000}}', 20)
ON CONFLICT ("id") DO NOTHING;
