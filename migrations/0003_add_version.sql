-- Adds an optimistic-concurrency version counter to app_state.
-- The server increments it on every write so clients can detect when another
-- device saved in between (409 Conflict) instead of silently clobbering data.
ALTER TABLE app_state ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
