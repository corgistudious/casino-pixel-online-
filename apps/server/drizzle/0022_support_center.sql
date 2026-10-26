-- Support Center: who wrote each message (player or staff), read tracking for reply notifications.
-- Additive; existing tickets and messages are kept and back-filled.
ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS from_staff boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE support_ticket_messages m SET from_staff = true FROM support_tickets t WHERE t.id = m.ticket_id AND m.author_id <> t.user_id AND m.from_staff = false;
--> statement-breakpoint
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS player_seen_at timestamptz;
--> statement-breakpoint
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS staff_seen_at timestamptz;
--> statement-breakpoint
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS last_staff_reply_at timestamptz;
--> statement-breakpoint
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS last_player_reply_at timestamptz;
--> statement-breakpoint
UPDATE support_tickets t SET
  last_staff_reply_at = (SELECT max(created_at) FROM support_ticket_messages m WHERE m.ticket_id = t.id AND m.from_staff),
  last_player_reply_at = (SELECT max(created_at) FROM support_ticket_messages m WHERE m.ticket_id = t.id AND NOT m.from_staff),
  player_seen_at = coalesce(player_seen_at, now()),
  staff_seen_at = coalesce(staff_seen_at, now());
