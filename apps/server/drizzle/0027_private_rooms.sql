-- Player-created rooms on the existing Poker / Xì Tố / Liêng and Blackjack tables. Additive:
-- official tables get kind = 'official' (the default); rooms are new rows of the same tables.
ALTER TABLE card_tables ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'official';
--> statement-breakpoint
ALTER TABLE card_tables ADD CONSTRAINT card_tables_kind_check CHECK (kind IN ('official', 'room'));
--> statement-breakpoint
ALTER TABLE bj_tables ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'official';
--> statement-breakpoint
ALTER TABLE bj_tables ADD CONSTRAINT bj_tables_kind_check CHECK (kind IN ('official', 'room'));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS game_rooms (
 id text PRIMARY KEY CHECK (id ~ '^(card|bj):r-[0-9a-f]{8}$'),
 engine text NOT NULL CHECK (engine IN ('card', 'bj')),
 table_id text NOT NULL,
 game text NOT NULL CHECK (game IN ('poker', 'xito', 'lieng', 'blackjack')),
 name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 24),
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
 -- Argon2id hash; required exactly when the room is private. Never sent to clients.
 password_hash text,
 stake bigint NOT NULL CHECK (stake > 0),
 owner_seen_at timestamptz NOT NULL DEFAULT now(),
 last_active_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz,
 UNIQUE (engine, table_id),
 CONSTRAINT game_rooms_password CHECK ((visibility = 'private') = (password_hash IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS game_rooms_open_idx ON game_rooms(game, created_at DESC) WHERE closed_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS game_rooms_owner_idx ON game_rooms(owner_id) WHERE closed_at IS NULL;
--> statement-breakpoint
-- Who may watch and sit in a room, and who was removed (kicked_until in the future).
CREATE TABLE IF NOT EXISTS room_access (
 room_id text NOT NULL REFERENCES game_rooms(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 via text NOT NULL CHECK (via IN ('password', 'invite', 'public')),
 invited_by uuid REFERENCES users(id) ON DELETE RESTRICT,
 granted_at timestamptz NOT NULL DEFAULT now(),
 kicked_until timestamptz,
 PRIMARY KEY (room_id, user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS room_access_user_idx ON room_access(user_id);
--> statement-breakpoint
-- Wrong passwords per room and player inside the current window (brute-force guard).
CREATE TABLE IF NOT EXISTS room_join_attempts (
 room_id text NOT NULL REFERENCES game_rooms(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
 window_start timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (room_id, user_id)
);
