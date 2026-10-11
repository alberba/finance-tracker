# WP11 — 30-day v1 retention & decommission checklist

Companion to `docs/migration/cutover-runbook.md`. Starts the moment step 9 of
the cutover runbook completes (Access re-opened to invited users). Do not
touch the legacy `finance_tracker_db` database or its `wrangler.toml`
binding/`migrations/` directory until this checklist is fully signed off.

## Why keep v1 at all

`finance-tracker-db` (legacy) stays declared in `wrangler.toml` as a
read-only reference and its migration files untouched for 30 days after
cutover, so that:

- The rollback path in the cutover runbook (§8) remains executable the
  entire window, not just on cutover day.
- `scripts/export-v2-to-v1-json.ts` has a known-good v1 shape to diff/merge
  against if a post-cutover issue requires reconciling v2 writes back into a
  v1-shaped export.
- The current authenticated client uses sync v2 and no longer selects the
  whole-state blob protocol. Older Pages deployments and rollback bundles may
  still call the owner-gated legacy `/api/state*` routes, so those server
  contracts remain available during the compatibility window.

## Day 0 (immediately after cutover, part of exiting maintenance mode)

- [ ] Confirm the deployed build is the reviewed sync-v2 client and has
      `AUTH_ENFORCED=true` (cutover runbook §6). Older deployed/rollback
      bundles may still use the retained owner-gated legacy routes.
- [ ] Confirm `wrangler.toml` still declares both `[[d1_databases]]` blocks
      (`finance_tracker_db` and `finance_tracker_db_v2`) and that
      `migrations_dir = "migrations"` for the legacy block is unchanged.
- [ ] Record the retention window end date (cutover date + 30 days) in the
      migration tracking ticket.
- [ ] Record the D1 Time Travel bookmark ID captured in cutover runbook §2
      alongside the retention end date — Time Travel's own retention on D1
      Free is shorter than 30 days, so this bookmark is only useful early in
      the window; note its actual expiry from `wrangler d1 time-travel info`.

## Weekly during the window (4 checks over 30 days)

For each check, record date + who performed it in the tracking ticket:

- [ ] **Week 1** — `wrangler d1 info finance-tracker-db-v2` (storage) and
      Cloudflare dashboard D1 analytics (reads/writes per day) reviewed
      against the thresholds in `cutover-runbook.md` §10. No alert-level
      metric.
- [ ] **Week 1** — confirm no write traffic has landed on
      `finance-tracker-db` (legacy) since cutover: `wrangler d1 info finance-tracker-db`
      row/size counts unchanged from the day-0 snapshot.
- [ ] **Week 2** — repeat both checks above.
- [ ] **Week 3** — repeat both checks above.
- [ ] **Week 4** — repeat both checks above; additionally re-run
      `pnpm migrate:validate-parity` once more against a fresh
      `wrangler d1 export finance-tracker-db --remote` snapshot vs. a fresh
      `wrangler d1 export finance-tracker-db-v2 --remote` snapshot, as a
      final parity re-confirmation before decommission (owner-user's data
      will have diverged from the original migrated snapshot by normal usage
      — expect and reconcile _new_ v2-only activity, not systematic drift in
      the originally migrated rows).

## Rollback still available during the window

If an issue is discovered at any point in the 30 days that requires
reverting to v1:

1. Follow `cutover-runbook.md` §8 rollback procedure in full — in
   particular, if v2 has received real writes since cutover (expected, by
   week 2+), run `pnpm migrate:export-v1-json` **first**, before reverting
   the deploy/binding, so no post-cutover data is lost.
2. Treat this as re-entering the maintenance window: block Access again
   (cutover runbook §1) for the duration of the export + reconciliation +
   redeploy.
3. Do not decommission v1 (below) if a rollback occurred — restart the
   30-day window from the rollback date instead.

## Decommission sign-off (day 30, or later if extended)

Only after every weekly check above is complete with no open issues:

- [ ] Final `wrangler d1 export finance-tracker-db --remote --output=.data/v1-final-archive.sql`
      taken and stored outside the repo (e.g. a private backup bucket/drive)
      as the permanent historical record — this is the last copy once the
      binding is removed.
- [ ] Product/owner sign-off recorded in the tracking ticket: "v1 data no
      longer needed as a live rollback source."
- [ ] Remove the `finance_tracker_db` `[[d1_databases]]` block from
      `wrangler.toml` (keep `finance_tracker_db_v2` and its
      `migrations_dir = "migrations-v2"` unchanged) and deploy.
- [ ] Remove `d1:migrate:local` / `d1:migrate:remote` scripts from
      `package.json` if nothing else references the legacy `migrations/`
      directory (grep first — `scripts/export-sqlite-to-d1.mjs` and any
      remaining legacy-path code/tests may still depend on it; do not remove
      blindly).
- [ ] After the app deploy with the binding removed has been verified
      healthy (repeat the owner verification checklist from
      `cutover-runbook.md` §7), delete the legacy database:
      `     wrangler d1 delete finance-tracker-db
  `
      This step is **irreversible** beyond the archived export above —
      confirm the archive file (first bullet) is verified readable before
      running it.
- [ ] Close out the migration tracking ticket referencing this checklist and
      the cutover runbook.

## Who owns this

The engineer/operator who ran the cutover is responsible for the weekly
checks and the final decommission sign-off, unless explicitly handed off in
the tracking ticket — record any handoff here or in the ticket, not only
verbally.
