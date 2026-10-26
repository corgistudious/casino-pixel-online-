-- Follows, profile likes, blocks, profile privacy and player reports. Additive: new tables only.
CREATE TABLE IF NOT EXISTS player_follows (
 follower_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 followee_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (follower_id, followee_id),
 CONSTRAINT player_follows_not_self CHECK (follower_id <> followee_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS player_follows_followee_idx ON player_follows(followee_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS profile_likes (
 liker_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 profile_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (liker_id, profile_id),
 CONSTRAINT profile_likes_not_self CHECK (liker_id <> profile_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS profile_likes_profile_idx ON profile_likes(profile_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS player_blocks (
 blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (blocker_id, blocked_id),
 CONSTRAINT player_blocks_not_self CHECK (blocker_id <> blocked_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS player_blocks_blocked_idx ON player_blocks(blocked_id);
--> statement-breakpoint
-- Absent row = defaults (everything shown). Wallet balances outside the Bank are always public.
CREATE TABLE IF NOT EXISTS profile_settings (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
 show_online boolean NOT NULL DEFAULT true,
 show_friends boolean NOT NULL DEFAULT true,
 show_collection boolean NOT NULL DEFAULT true,
 show_stats boolean NOT NULL DEFAULT true,
 showcase uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(showcase) <= 6),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS player_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 target_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 category text NOT NULL CHECK (category IN ('cheating', 'harassment', 'spam', 'inappropriate', 'exploit', 'impersonation', 'other')),
 description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 1000),
 context text CHECK (char_length(context) <= 120),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'rejected')),
 handled_by uuid REFERENCES users(id) ON DELETE RESTRICT,
 resolution text CHECK (char_length(resolution) <= 1000),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 CONSTRAINT player_reports_not_self CHECK (reporter_id <> target_id)
);
--> statement-breakpoint
-- One open report per reporter and target: repeats while it is open are refused.
CREATE UNIQUE INDEX IF NOT EXISTS player_reports_one_open_idx ON player_reports(reporter_id, target_id) WHERE status IN ('pending', 'reviewing');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS player_reports_queue_idx ON player_reports(status, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS player_reports_target_idx ON player_reports(target_id, created_at DESC);
