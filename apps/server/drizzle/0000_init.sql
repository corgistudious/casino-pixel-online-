CREATE TABLE "fair_seeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"server_seed" text NOT NULL,
	"server_seed_hash" text NOT NULL,
	"client_seed" text NOT NULL,
	"nonce" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revealed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "game_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"game" text NOT NULL,
	"bet" bigint NOT NULL,
	"payout" bigint DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"state" jsonb,
	"result" jsonb,
	"seed_id" uuid,
	"nonce" integer,
	"idempotency_key" text NOT NULL,
	"last_action_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"delta" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"reason" text NOT NULL,
	"round_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"username_lower" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"locale" text DEFAULT 'vi' NOT NULL,
	"avatar" integer DEFAULT 0 NOT NULL,
	"role" text DEFAULT 'player' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"last_daily_bonus_at" timestamp with time zone,
	"last_rescue_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"balance" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_balance_non_negative" CHECK ("wallets"."balance" >= 0)
);
--> statement-breakpoint
ALTER TABLE "fair_seeds" ADD CONSTRAINT "fair_seeds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_seed_id_fair_seeds_id_fk" FOREIGN KEY ("seed_id") REFERENCES "public"."fair_seeds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fair_seeds_one_active_idx" ON "fair_seeds" USING btree ("user_id") WHERE "fair_seeds"."active";--> statement-breakpoint
CREATE UNIQUE INDEX "game_rounds_idempotency_idx" ON "game_rounds" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "game_rounds_one_active_idx" ON "game_rounds" USING btree ("user_id","game") WHERE "game_rounds"."status" = 'active';--> statement-breakpoint
CREATE INDEX "game_rounds_user_created_idx" ON "game_rounds" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_user_idx" ON "ledger_entries" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_idx" ON "users" USING btree ("username_lower");--> statement-breakpoint
CREATE INDEX "wallets_balance_idx" ON "wallets" USING btree ("balance");