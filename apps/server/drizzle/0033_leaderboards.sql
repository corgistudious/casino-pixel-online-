-- Leaderboards: per-game results and streaks, period snapshots, ranking awards and tournament
-- results. Additive only: no existing row is changed. Game statistics are maintained by a trigger
-- on game_rounds, the one table every game already writes exactly once per player and settled
-- round (unique (user_id, idempotency_key)), so retries and reconnects cannot count twice.

-- Leaderboard game for a game_rounds.game value: the solo Sic Bo and the shared Tài Xỉu Live are
-- the same dice game; slots are not ranked.
CREATE OR REPLACE FUNCTION keyo_board_game(g text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE g
    WHEN 'sicbo' THEN 'taixiu'
    WHEN 'taixiu' THEN 'taixiu'
    WHEN 'roulette' THEN 'roulette'
    WHEN 'blackjack' THEN 'blackjack'
    WHEN 'poker' THEN 'poker'
    WHEN 'lieng' THEN 'lieng'
    WHEN 'xito' THEN 'xito'
  END
$$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS player_game_stats (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  game text NOT NULL,
  played integer NOT NULL DEFAULT 0 CHECK (played >= 0),
  wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
  pushes integer NOT NULL DEFAULT 0 CHECK (pushes >= 0),
  current_streak integer NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  best_streak integer NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
  best_streak_at timestamptz,
  last_result_at timestamptz,
  PRIMARY KEY (user_id, game)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS player_game_stats_wins_idx ON player_game_stats (game, wins DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS player_game_stats_best_idx ON player_game_stats (game, best_streak DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS player_game_stats_current_idx ON player_game_stats (game, current_streak DESC);
--> statement-breakpoint
-- One row per player, game and UTC day: week, month and season boards sum these instead of
-- scanning game history. best_streak = highest running streak reached that day.
CREATE TABLE IF NOT EXISTS player_game_daily (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  game text NOT NULL,
  day date NOT NULL,
  played integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  pushes integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, game, day)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS player_game_daily_game_day_idx ON player_game_daily (game, day);
--> statement-breakpoint
-- Win: payout above the stake. Push: stake returned (Blackjack push, split pot, a Tài Xỉu/Roulette
-- round whose bets returned exactly the total stake) — neither extends nor breaks a streak.
-- Loss: anything less, breaks the streak. A Tài Xỉu/Roulette round counts once per player with all
-- of that player's bets in the round added together. Zero-stake rows (a card seat that put nothing
-- in) are not games. Void or refunded rounds never become 'settled' rows.
CREATE OR REPLACE FUNCTION keyo_record_game_result() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  g text;
  outcome text;
  at timestamptz;
  streak integer;
BEGIN
  IF NEW.status <> 'settled' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'settled' THEN RETURN NEW; END IF;
  g := keyo_board_game(NEW.game);
  IF g IS NULL OR NEW.bet <= 0 THEN RETURN NEW; END IF;
  outcome := CASE WHEN NEW.payout > NEW.bet THEN 'win' WHEN NEW.payout = NEW.bet THEN 'push' ELSE 'loss' END;
  at := coalesce(NEW.settled_at, now());
  INSERT INTO player_game_stats (user_id, game) VALUES (NEW.user_id, g) ON CONFLICT DO NOTHING;
  UPDATE player_game_stats SET
    played = played + 1,
    wins = wins + (outcome = 'win')::int,
    losses = losses + (outcome = 'loss')::int,
    pushes = pushes + (outcome = 'push')::int,
    current_streak = CASE outcome WHEN 'win' THEN current_streak + 1 WHEN 'loss' THEN 0 ELSE current_streak END,
    best_streak_at = CASE WHEN outcome = 'win' AND current_streak + 1 > best_streak THEN at ELSE best_streak_at END,
    best_streak = CASE WHEN outcome = 'win' THEN greatest(best_streak, current_streak + 1) ELSE best_streak END,
    last_result_at = at
  WHERE user_id = NEW.user_id AND game = g
  RETURNING current_streak INTO streak;
  INSERT INTO player_game_daily AS d (user_id, game, day, played, wins, losses, pushes, best_streak)
  VALUES (NEW.user_id, g, (at AT TIME ZONE 'UTC')::date, 1, (outcome = 'win')::int, (outcome = 'loss')::int, (outcome = 'push')::int, CASE WHEN outcome = 'win' THEN streak ELSE 0 END)
  ON CONFLICT (user_id, game, day) DO UPDATE SET
    played = d.played + 1,
    wins = d.wins + EXCLUDED.wins,
    losses = d.losses + EXCLUDED.losses,
    pushes = d.pushes + EXCLUDED.pushes,
    best_streak = greatest(d.best_streak, EXCLUDED.best_streak);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS game_rounds_leaderboard_stats ON game_rounds;
--> statement-breakpoint
CREATE TRIGGER game_rounds_leaderboard_stats AFTER INSERT OR UPDATE OF status ON game_rounds
  FOR EACH ROW EXECUTE FUNCTION keyo_record_game_result();
--> statement-breakpoint
-- Finalised results of a closed period. Written once, never changed.
CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  board_id text NOT NULL,
  period_key text NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz NOT NULL,
  entries jsonb NOT NULL,
  finalized_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, period_key)
);
--> statement-breakpoint
-- Every ranking reward given: which board, period, place and item. One row per player and period.
CREATE TABLE IF NOT EXISTS leaderboard_awards (
  id bigserial PRIMARY KEY,
  board_id text NOT NULL,
  period_key text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  place smallint NOT NULL CHECK (place BETWEEN 1 AND 3),
  metric numeric NOT NULL,
  reigning_item text,
  reigning_until timestamptz,
  legacy_item text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_id, period_key, user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS leaderboard_awards_user_idx ON leaderboard_awards (user_id, created_at DESC);
--> statement-breakpoint
-- Rows are never changed. The only deletion allowed is reset:test-data removing TEST accounts,
-- which sets keyo.purge_test_data inside its own transaction.
CREATE OR REPLACE FUNCTION keyo_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('keyo.purge_test_data', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'append_only: % rows cannot be changed or removed', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS leaderboard_snapshots_append_only ON leaderboard_snapshots;
--> statement-breakpoint
CREATE TRIGGER leaderboard_snapshots_append_only BEFORE UPDATE OR DELETE ON leaderboard_snapshots FOR EACH ROW EXECUTE FUNCTION keyo_append_only();
--> statement-breakpoint
DROP TRIGGER IF EXISTS leaderboard_awards_append_only ON leaderboard_awards;
--> statement-breakpoint
CREATE TRIGGER leaderboard_awards_append_only BEFORE UPDATE OR DELETE ON leaderboard_awards FOR EACH ROW EXECUTE FUNCTION keyo_append_only();
--> statement-breakpoint
-- Tournament results. There is no tournament engine yet: rows only appear once a tournament is
-- finished and its placements are confirmed (finalizeTournament), never for running ones.
CREATE TABLE IF NOT EXISTS tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_vi text NOT NULL,
  name_en text NOT NULL,
  game text NOT NULL,
  season_label text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'running', 'finished', 'cancelled')),
  rewards jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS tournament_results (
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  placement integer NOT NULL CHECK (placement >= 1),
  points integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  reward_item text,
  PRIMARY KEY (tournament_id, user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tournament_results_user_idx ON tournament_results (user_id);
--> statement-breakpoint
-- Period boards over existing tables.
CREATE INDEX IF NOT EXISTS profile_likes_created_idx ON profile_likes (created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS player_follows_created_idx ON player_follows (created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS charm_ledger_created_idx ON charm_ledger (created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS quest_claims_created_idx ON quest_claims (created_at);
