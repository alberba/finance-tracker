CREATE TABLE issue_reports (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  issue_number INTEGER NOT NULL,
  submitted_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX issue_reports_user_issue_idx ON issue_reports(user_id, issue_number);
--> statement-breakpoint
CREATE INDEX issue_reports_user_submitted_idx ON issue_reports(user_id, submitted_at);
