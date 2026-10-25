CREATE TABLE IF NOT EXISTS public_chat_messages (
 id bigserial PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
 created_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz,
 deleted_by uuid REFERENCES users(id) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS public_chat_messages_recent_idx ON public_chat_messages(id DESC) WHERE deleted_at IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public_chat_mutes (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
 until_at timestamptz NOT NULL,
 reason text NOT NULL,
 issued_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);
