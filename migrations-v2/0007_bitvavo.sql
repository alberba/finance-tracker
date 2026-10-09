ALTER TABLE transactions ADD COLUMN external_id TEXT;
ALTER TABLE transactions ADD COLUMN remote_operation TEXT;
CREATE UNIQUE INDEX transactions_user_external_idx ON transactions(user_id, external_id);
CREATE TABLE bitvavo_connections (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  start_date TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  cursor INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  lock_token TEXT,
  lock_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE bitvavo_previews (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  preview TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  resolutions TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX bitvavo_previews_user_idx ON bitvavo_previews(user_id);
