CREATE TABLE auth_proof (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES auth_session(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose = 'local-pin-recovery'),
  expires_at INTEGER NOT NULL
);
