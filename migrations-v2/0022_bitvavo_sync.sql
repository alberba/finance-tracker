-- Bitvavo sync lifecycle (#191): the outcome of the last attempt, the last
-- successful sync, the operations skipped because they are not in EUR, and an
-- audit trail without secrets or remote payloads.
ALTER TABLE bitvavo_connections ADD COLUMN last_attempt_at INTEGER;
--> statement-breakpoint
ALTER TABLE bitvavo_connections ADD COLUMN last_attempt_status TEXT;
--> statement-breakpoint
ALTER TABLE bitvavo_connections ADD COLUMN last_error TEXT;
--> statement-breakpoint
ALTER TABLE bitvavo_connections ADD COLUMN last_success_at INTEGER;
--> statement-breakpoint
ALTER TABLE bitvavo_connections ADD COLUMN last_counts TEXT;
--> statement-breakpoint
ALTER TABLE bitvavo_connections ADD COLUMN needs_attention INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE bitvavo_skipped (
  user_id TEXT NOT NULL REFERENCES users(id),
  external_id TEXT NOT NULL,
  executed_at TEXT,
  reason TEXT NOT NULL,
  PRIMARY KEY (user_id, external_id)
);
--> statement-breakpoint
CREATE TABLE integration_audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX integration_audit_events_user_idx ON integration_audit_events(user_id, created_at);
