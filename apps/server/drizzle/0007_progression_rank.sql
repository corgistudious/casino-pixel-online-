CREATE TABLE "exp_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_key" text NOT NULL,
	"amount" integer NOT NULL,
	"level_before" integer NOT NULL,
	"level_after" integer NOT NULL,
	"actor_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "level_rewards" (
	"level" integer PRIMARY KEY NOT NULL,
	"attachments" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "level_rewards_range" CHECK ("level_rewards"."level" BETWEEN 2 AND 999)
);
--> statement-breakpoint
CREATE TABLE "player_progress" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"exp" bigint DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"exp_today" integer DEFAULT 0 NOT NULL,
	"exp_day" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_progress_exp_nonnegative" CHECK ("player_progress"."exp" >= 0),
	CONSTRAINT "player_progress_level_range" CHECK ("player_progress"."level" BETWEEN 1 AND 999)
);
--> statement-breakpoint
CREATE TABLE "player_ranks" (
	"season_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"division" smallint NOT NULL,
	"rp" integer DEFAULT 0 NOT NULL,
	"streak" smallint DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"peak_division" smallint NOT NULL,
	"peak_top_position" integer,
	"rp_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_ranks_season_id_user_id_pk" PRIMARY KEY("season_id","user_id"),
	CONSTRAINT "player_ranks_division_range" CHECK ("player_ranks"."division" BETWEEN 0 AND 39),
	CONSTRAINT "player_ranks_rp_nonnegative" CHECK ("player_ranks"."rp" >= 0),
	CONSTRAINT "player_ranks_streak_range" CHECK ("player_ranks"."streak" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE TABLE "rank_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"match_key" text NOT NULL,
	"result" text NOT NULL,
	"rp_delta" integer NOT NULL,
	"division_before" smallint NOT NULL,
	"division_after" smallint NOT NULL,
	"rp_before" integer NOT NULL,
	"rp_after" integer NOT NULL,
	"streak_after" smallint NOT NULL,
	"promoted" boolean DEFAULT false NOT NULL,
	"demoted" boolean DEFAULT false NOT NULL,
	"actor_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_season_results" (
	"season_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"division" smallint NOT NULL,
	"rp" integer NOT NULL,
	"peak_division" smallint NOT NULL,
	"top_position" integer,
	"top_title" text,
	"peak_top_position" integer,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rank_season_results_season_id_user_id_pk" PRIMARY KEY("season_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rank_seasons" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rank_seasons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"rules" jsonb NOT NULL,
	"rewards" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "rank_seasons_dates" CHECK ("rank_seasons"."ends_at" > "rank_seasons"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "mail_messages" ADD COLUMN "reward_key" text;--> statement-breakpoint
ALTER TABLE "exp_events" ADD CONSTRAINT "exp_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_progress" ADD CONSTRAINT "player_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ranks" ADD CONSTRAINT "player_ranks_season_id_rank_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."rank_seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_ranks" ADD CONSTRAINT "player_ranks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_events" ADD CONSTRAINT "rank_events_season_id_rank_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."rank_seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_events" ADD CONSTRAINT "rank_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_season_results" ADD CONSTRAINT "rank_season_results_season_id_rank_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."rank_seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_season_results" ADD CONSTRAINT "rank_season_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exp_events_source_idx" ON "exp_events" USING btree ("user_id","source_key");--> statement-breakpoint
CREATE INDEX "exp_events_user_idx" ON "exp_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "player_progress_ladder_idx" ON "player_progress" USING btree ("exp");--> statement-breakpoint
CREATE INDEX "player_ranks_ladder_idx" ON "player_ranks" USING btree ("season_id","division","rp");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_events_match_idx" ON "rank_events" USING btree ("season_id","user_id","match_key");--> statement-breakpoint
CREATE INDEX "rank_events_user_idx" ON "rank_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_seasons_one_active_idx" ON "rank_seasons" USING btree ("status") WHERE "rank_seasons"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "mail_messages_reward_key_idx" ON "mail_messages" USING btree ("user_id","reward_key") WHERE "mail_messages"."reward_key" IS NOT NULL;--> statement-breakpoint
-- ---------------------------------------------------------------- history rows are never rewritten
CREATE FUNCTION "keyo_history_no_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be modified', TG_TABLE_NAME;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "exp_events_no_update" BEFORE UPDATE ON "exp_events" FOR EACH ROW EXECUTE FUNCTION "keyo_history_no_update"();--> statement-breakpoint
CREATE TRIGGER "rank_events_no_update" BEFORE UPDATE ON "rank_events" FOR EACH ROW EXECUTE FUNCTION "keyo_history_no_update"();
