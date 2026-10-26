-- Shared Blackjack tables (up to 5 seats). Additive: no existing data is touched.
CREATE TABLE IF NOT EXISTS bj_tables (
 id text PRIMARY KEY,
 name_vi text NOT NULL,
 name_en text NOT NULL,
 min_bet bigint NOT NULL CHECK (min_bet > 0),
 max_bet bigint NOT NULL CHECK (max_bet >= min_bet),
 seats integer NOT NULL DEFAULT 5 CHECK (seats BETWEEN 1 AND 5),
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paused', 'closed')),
 sort integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS bj_seats (
 table_id text NOT NULL REFERENCES bj_tables(id) ON DELETE RESTRICT,
 seat integer NOT NULL CHECK (seat BETWEEN 0 AND 4),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 leaving boolean NOT NULL DEFAULT false,
 idle_rounds integer NOT NULL DEFAULT 0,
 joined_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (table_id, seat)
);
--> statement-breakpoint
-- One shared Blackjack seat per player.
CREATE UNIQUE INDEX IF NOT EXISTS bj_seats_user_idx ON bj_seats(user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS bj_rounds (
 id uuid PRIMARY KEY,
 table_id text NOT NULL REFERENCES bj_tables(id) ON DELETE RESTRICT,
 seq bigint NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'void')),
 state jsonb NOT NULL,
 version integer NOT NULL DEFAULT 0,
 server_seed text NOT NULL,
 seed_hash text NOT NULL,
 deadline timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 ended_at timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS bj_rounds_one_active_idx ON bj_rounds(table_id) WHERE status = 'active';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS bj_rounds_table_seq_idx ON bj_rounds(table_id, seq DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS bj_rounds_deadline_idx ON bj_rounds(deadline) WHERE status = 'active';
--> statement-breakpoint
INSERT INTO bj_tables (id, name_vi, name_en, min_bet, max_bet, sort) VALUES
 ('bj-1', 'Blackjack 1', 'Blackjack 1', 100, 10000, 1),
 ('bj-2', 'Blackjack VIP', 'Blackjack VIP', 1000, 100000, 2)
ON CONFLICT (id) DO NOTHING;
