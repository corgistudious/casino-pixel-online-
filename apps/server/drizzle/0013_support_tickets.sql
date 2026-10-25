CREATE TABLE IF NOT EXISTS support_tickets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 category text NOT NULL CHECK (category IN ('account','game','payment','report','other')),
 subject text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed')),
 assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets(user_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status, updated_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS support_ticket_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE RESTRICT,
 author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx ON support_ticket_messages(ticket_id, created_at, id);
