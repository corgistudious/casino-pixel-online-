-- Manual rollback for 0028_report_attachments (owner approval + backup first). Removes the evidence
-- images only; the reports themselves stay. Export them first if they must be kept.
DROP TABLE IF EXISTS report_attachments;
-- Afterwards delete the 0028 row from drizzle.__drizzle_migrations so the migration can re-run.
