-- Player-uploaded profile photos. Additive. The image bytes live in PostgreSQL (assets table, the
-- same persistent store as catalog art), so they survive restarts, container rebuilds and deploys.
-- The users table is not changed: avatar / avatar_item / frame stay exactly as they are, and the
-- single 'active' upload (if any) is the photo shown. Removing it shows the equipped avatar again.
CREATE TABLE IF NOT EXISTS avatar_uploads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 asset_id text REFERENCES assets(id) ON DELETE SET NULL,
 mime text NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
 size integer NOT NULL CHECK (size BETWEEN 1 AND 5242880),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'replaced', 'removed', 'rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 ended_at timestamptz,
 moderated_by uuid REFERENCES users(id) ON DELETE SET NULL,
 moderation_reason text CHECK (moderation_reason IS NULL OR char_length(moderation_reason) BETWEEN 3 AND 500)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS avatar_uploads_user_idx ON avatar_uploads(user_id, created_at DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS avatar_uploads_one_active ON avatar_uploads(user_id) WHERE status = 'active';
