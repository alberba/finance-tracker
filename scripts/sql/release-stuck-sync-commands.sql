-- Audit §2.2 (docs/migration/d1-v2-persistence-audit.md): before the
-- `rejected` status existed, a command whose mutation threw left its
-- `sync_commands` reservation in `processing` with no result, and every
-- retry re-ran the same invalid payload.
--
-- After deploying the fix, validation/reference failures finalize as
-- `rejected`; any other server error can still leave a row in this state.
-- This one-off deletes the leftovers so a stale claim no longer re-runs them.
-- Inspect first (and add `AND user_id IN (...)` to scope it), then run:
--
--   wrangler d1 execute finance-tracker-db-v2 --remote \
--     --command "SELECT user_id, id, command_type, created_at FROM sync_commands WHERE status = 'processing' AND result IS NULL"
--   wrangler d1 execute finance-tracker-db-v2 --remote --file scripts/sql/release-stuck-sync-commands.sql

DELETE FROM sync_commands
WHERE status = 'processing'
  AND result IS NULL
  AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 minutes');
