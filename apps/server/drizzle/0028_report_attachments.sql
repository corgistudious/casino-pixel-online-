-- Evidence images on player reports. Additive. Rows belong to their report and go with it.
CREATE TABLE IF NOT EXISTS report_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 report_id uuid NOT NULL REFERENCES player_reports(id) ON DELETE CASCADE,
 mime text NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
 width integer NOT NULL CHECK (width BETWEEN 1 AND 8000),
 height integer NOT NULL CHECK (height BETWEEN 1 AND 8000),
 size integer NOT NULL CHECK (size BETWEEN 1 AND 1048576),
 sha256 text NOT NULL,
 bytes bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (report_id, sha256)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS report_attachments_report_idx ON report_attachments(report_id);
