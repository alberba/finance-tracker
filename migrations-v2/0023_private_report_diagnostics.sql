ALTER TABLE issue_reports ADD COLUMN private_title TEXT;
--> statement-breakpoint
ALTER TABLE issue_reports ADD COLUMN case_reference TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX issue_reports_case_reference_idx ON issue_reports(case_reference);
--> statement-breakpoint
CREATE TABLE report_diagnostics (
  report_id TEXT PRIMARY KEY NOT NULL REFERENCES issue_reports(id) ON DELETE CASCADE,
  capture TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX report_diagnostics_expiry_idx ON report_diagnostics(expires_at);
--> statement-breakpoint
CREATE TABLE report_support_grants (
  report_id TEXT NOT NULL REFERENCES issue_reports(id) ON DELETE CASCADE,
  support_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (report_id, support_user_id)
);
--> statement-breakpoint
CREATE TABLE report_support_audit (
  id TEXT PRIMARY KEY NOT NULL,
  issue_number INTEGER NOT NULL,
  actor_id TEXT,
  subject_id TEXT,
  action TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE report_private_comments (
  id INTEGER PRIMARY KEY NOT NULL,
  report_id TEXT NOT NULL REFERENCES issue_reports(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  edited_at TEXT
);
--> statement-breakpoint
CREATE INDEX report_private_comments_report_idx ON report_private_comments(report_id);
--> statement-breakpoint
CREATE TABLE report_private_files (
  id TEXT PRIMARY KEY NOT NULL,
  report_id TEXT NOT NULL REFERENCES issue_reports(id) ON DELETE CASCADE,
  comment_id INTEGER REFERENCES report_private_comments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX report_private_files_report_idx ON report_private_files(report_id, comment_id);
--> statement-breakpoint
CREATE TABLE report_private_file_parts (
  file_id TEXT NOT NULL REFERENCES report_private_files(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (file_id, sequence)
);
