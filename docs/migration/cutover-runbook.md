# WP11 — Cutover runbook: v1 → v2 (D1 relational, Cf-Access auth, sync v2)

Status: **do not execute against production until WP9 + WP10 are green** (per
`docs/migration/work-packages.md`, WP11 acceptance criteria). This document
is the single-maintenance-window procedure for flipping the deployed app from
the legacy path (`finance_tracker_db`, unauthenticated namespace header,
`localStorage`) to the v2 path (`finance_tracker_db_v2`, Cf-Access identity,
IndexedDB/outbox sync).

Companion doc: `docs/migration/retention-checklist.md` (30-day v1 retention +
decommission sign-off).

Every command below is copy-pasted from what actually exists in this repo
today (`package.json` scripts, `scripts/*.ts --help` output, `wrangler.toml`)
— nothing here is aspirational. If a command's flags have drifted, re-run
`pnpm migrate:v1-to-v2 --help` / `tsx scripts/validate-migration-parity.ts --help`
(or read the script's `parseCliArgs`) and fix this doc before proceeding.

## 0. Preconditions

- [ ] WP9 acceptance criteria met: `pnpm migrate:v1-to-v2 --dry-run` produces a
      zero-discrepancy parity report against current production data; a
      forced mid-batch failure leaves the v2 target unchanged.
- [ ] WP10 acceptance criteria met: `pnpm test:unit`, `pnpm test:integration`,
      `pnpm lint`, `pnpm check`, `pnpm build`, `pnpm test:e2e` all green in CI
      on the commit being deployed.
- [ ] A full dry run of *this* runbook has been executed at least once
      against a staging copy (real acceptance criterion from
      `work-packages.md`'s WP11 entry) — the rollback path
      (`migrate:export-v1-json` + binding/deploy revert) exercised at least
      once before touching real production data.
- [ ] `DATA_ENCRYPTION_KEY` (and `DATA_ENCRYPTION_KEY_VERSION` if rotated) is
      set as a `wrangler secret` in the target environment — required before
      any `integration_credentials` row (Stock Events API key) can be
      written/read by WP12's repository.
- [ ] `LEGACY_OWNER_EMAIL` is set to the real Cf-Access identity of whoever
      owns the existing single-tenant v1 data.
- [ ] `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` are set for the target
      environment (WP3 middleware needs these to verify `Cf-Access-Jwt-Assertion`
      once `AUTH_ENFORCED=true`).
- [ ] Maintenance window scheduled and communicated to the (currently single)
      owner-user; expected duration: the steps below plus buffer, typically
      well under an hour for a single-tenant dataset.

## 1. Enter maintenance mode (block v1 writes)

> **Confirmed:** a Cloudflare Access application (`finance tracker`) already
> fronts this deployment, on team domain **`alberba.cloudflareaccess.com`**,
> with **GitHub** configured as an identity provider alongside one-time-PIN
> email. So `CF_ACCESS_TEAM_DOMAIN=alberba.cloudflareaccess.com`, and the
> maintenance-mode lever in this section does exist.
>
> This supersedes Contradiction #2 in `work-packages.md`, which said there was
> "no auth boundary at all". That was about the *application code* — which is
> still true, v1 routes trust a client-supplied `x-finance-namespace` header —
> but Access is enforcing at the edge in front of it.
>
> Two values still have to be read from the dashboard before the window:
>
> 1. **`CF_ACCESS_AUD`** — Zero Trust → Access → Applications → `finance
>    tracker` → *Application Audience (AUD) Tag*. Without it the WP3
>    middleware cannot verify a single JWT and `AUTH_ENFORCED=true` would 401
>    every request.
> 2. **The exact email GitHub puts in the JWT** — see the warning under
>    `LEGACY_OWNER_EMAIL` in §0. Sign in through Access and open
>    `https://<app-hostname>/cdn-cgi/access/get-identity`; the `email` field
>    in that JSON is verbatim what the middleware will compare against.

This app has no built-in maintenance-mode flag (no code path checks one) and
today's legacy routes (`src/pages/api/state.ts`, `state/reset-legacy.ts`) are
**unauthenticated** — the only lever available without shipping new code is
the Cloudflare Access policy fronting this app (WP3's
`CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD`).

1. In the Cloudflare Zero Trust dashboard, edit the Access policy for this
   application to **allow only the migration operator** (deny the
   owner-user's identity for the duration of the window). This blocks every
   request — reads and writes — to both legacy and v2 routes.
2. Confirm from a browser/incognito session as the owner-user that the app
   is now blocked (Access login wall, no route reachable).
3. Note the exact timestamp — this is the "no more v1 writes after this
   point" cutoff the parity check in step 4 must be run against.

## 2. Export v1 + take a Time Travel bookmark

1. Record a D1 Time Travel bookmark for the legacy database so v1 can be
   restored to this exact point if anything goes wrong later:
   ```
   wrangler d1 time-travel info finance-tracker-db
   ```
   Save the returned bookmark ID in the migration ticket/runbook execution
   log — this is the point-in-time restore target for v1, independent of the
   30-day retention window in `retention-checklist.md`.
2. Export the current v1 state as a portable snapshot (belt-and-braces
   alongside Time Travel — also gives you a local file for the dry-run
   parity comparison in step 4 without touching production again):
   ```
   wrangler d1 export finance-tracker-db --remote --output=.data/v1-cutover-snapshot.sql
   ```

## 3. Provision the v2 database (first cutover only)

Skip this whole section if `finance-tracker-db-v2` already exists (re-running
`wrangler d1 create` on an existing name is a no-op error, not idempotent).

1. Create the real D1 database:
   ```
   wrangler d1 create finance-tracker-db-v2
   ```
2. Copy the `database_id` from the command output into `wrangler.toml`,
   replacing the placeholder on the `finance_tracker_db_v2` binding:
   ```toml
   [[d1_databases]]
   binding = "finance_tracker_db_v2"
   database_name = "finance-tracker-db-v2"
   database_id = "<real-id-from-wrangler-d1-create>"   # was 00000000-0000-7000-8000-000000000000
   migrations_dir = "migrations-v2"
   ```
   **This edit is for the wrangler CLI, not for the deploy.** This app ships
   as a **Cloudflare Pages** project (`finance-tracker`), and Pages only reads
   `wrangler.toml` when it declares `pages_build_output_dir` — this one does
   not. Empirical confirmation: the D1 v2 stack's preview builds all went
   green while `database_id` was still the bogus placeholder, which could not
   happen if the deploy validated these bindings. So `wrangler.toml` here
   drives `wrangler d1 …` CLI commands only; the runtime bindings the
   deployed app actually receives are the ones configured in the Pages
   project's **Settings → Functions → D1 database bindings**.
   Consequence: the placeholder never breaks a deploy, but it *does* break
   step 3 below, and **the `finance_tracker_db_v2` binding must be added in
   the Pages dashboard** (same binding name) or every v2 route 500s at
   runtime with "binding no disponible".
3. Apply the WP1 migration set to the new remote database:
   ```
   pnpm d1:migrate:remote:v2
   ```
   (equivalent to `wrangler d1 migrations apply finance-tracker-db-v2 --remote`,
   per the script in `package.json`)
4. Add the `finance_tracker_db_v2` binding to the Pages project (Settings →
   Functions → D1 database bindings, for both Production and Preview) and
   redeploy, *before* running the migration tool, so the binding is live for
   the deploy in step 6. Committing `wrangler.toml` alone does **not** do
   this — see the note in step 2.

## 4. Run the v1 → v2 migration tool (remote path)

The migration CLI (`scripts/migrate-v1-to-v2.ts`) always writes to a local
v2 SQLite staging file first (its module doc: no Workers runtime is
available from a plain Node script to talk to D1 directly), then optionally
dumps the result as SQL for `wrangler d1 execute --remote` to apply — the
same convention as the existing `scripts/export-sqlite-to-d1.mjs`.

1. Run the migration against the v1 snapshot exported in step 2, writing to
   a fresh local v2 staging file and producing a remote-apply SQL dump:
   ```
   pnpm migrate:v1-to-v2 -- \
     --v1-remote=finance-tracker-db \
     --v2-sqlite=.data/finance-tracker-v2-cutover.sqlite \
     --remote-sql-out=.data/migrate-v2-remote.sql \
     --legacy-owner-email=<LEGACY_OWNER_EMAIL value> \
     --report-out=.data/migrate-v2-cutover-report.json
   ```
   (`--v1-remote` shells out to `wrangler d1 execute finance-tracker-db --remote --json`
   internally, per `scripts/lib/migration-db.ts`; use `--v1-sqlite=.data/v1-cutover-snapshot.sql`-derived
   sqlite instead if you prefer to migrate from the step-2 export file rather
   than re-reading remote v1 live.)
2. Inspect `.data/migrate-v2-cutover-report.json` — confirm counts/checksums
   show no anomalies before proceeding. **Abort criterion**: any reported
   anomaly, checksum mismatch, or non-zero exit code halts the runbook here;
   go to §8 (abort/rollback) rather than continuing.
3. Apply the generated SQL to the real remote v2 database:
   ```
   wrangler d1 execute finance-tracker-db-v2 --remote --file=.data/migrate-v2-remote.sql
   ```

## 5. Validate migration parity

```
pnpm migrate:validate-parity -- \
  --v1-remote... # not supported by this script — use the local sources below
```

`scripts/validate-migration-parity.ts` reads v1 from a local SQLite file or
raw JSON only (no `--v1-remote` flag exists on this script today — only
`migrate-v1-to-v2.ts` shells out to `wrangler d1 execute --remote`). Use the
step-2 export or a JSON dump of it as the v1 source, and the same local v2
staging file written in step 4:

```
wrangler d1 export finance-tracker-db --remote --output=.data/v1-cutover-snapshot.sql
# then load .data/v1-cutover-snapshot.sql into a local sqlite file if using
# --v1-sqlite, or pass an already-normalized JSON export via --v1-json

pnpm migrate:validate-parity -- \
  --v1-sqlite=.data/v1-cutover-snapshot.sqlite \
  --v2-sqlite=.data/finance-tracker-v2-cutover.sqlite \
  --email=<LEGACY_OWNER_EMAIL value>
```

- Exit code `0` + "zero discrepancies" in stdout → proceed to step 6.
- Exit code `1` (any discrepancy listed: counts, monthly totals, wealth per
  snapshot, budget/goal totals) → **abort criterion**, go to §8.

## 6. Deploy with the binding flip + feature flags

Set these in the **Pages project** (Settings → Environment variables), not in
`wrangler.toml` — per the step-2 note, Pages does not read that file here.
Pages distinguishes **build-time** variables (present while `astro build`
runs) from **runtime** variables (present in the Function at request time),
and getting that distinction wrong is the most likely silent failure of this
whole cutover:

| Variable | Cutover value | Where it must be set |
|---|---|---|
| `PUBLIC_SYNC_V2` | `true` | **Build-time.** Read via `import.meta.env` in `src/lib/client/feature-flags.ts`, so it is inlined into the client bundle at build. Setting it only as a runtime variable silently leaves the app on the legacy `localStorage` path with no error anywhere |
| `AUTH_ENFORCED` | `true` | Runtime (read from `locals.runtime.env` in `src/middleware.ts`) |
| `LEGACY_OWNER_EMAIL` | (unchanged, already set in step 0) | Runtime |
| `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` | (unchanged, already set in step 0) | Runtime |
| `DATA_ENCRYPTION_KEY` | (unchanged, already set in step 0) | Runtime, marked **encrypted/secret** in the dashboard |
| `TEST_AUTH_ENABLED` | **unset** | Must not exist in this environment at all — it enables an `X-Test-User-Email` auth bypass |

Remember Pages keeps **Production and Preview** environment variables
separate. Set both if preview deployments should also run the v2 path;
leaving Preview on the old values is a legitimate choice, but then preview
URLs keep exercising the legacy path.

Both `finance_tracker_db` and `finance_tracker_db_v2` bindings stay bound to
the Pages project — v1's binding is a read-only reference kept for the
30-day retention window (`retention-checklist.md`), `migrations/` stays
untouched.

Deploy through the project's normal Pages flow (push to the production
branch, or `wrangler pages deploy`). A `PUBLIC_SYNC_V2` change only takes
effect on a **fresh build** — re-promoting an existing deployment will not
pick it up.

## 7. Owner verification checklist (smoke test before exiting maintenance)

Perform each of these as the actual owner-user, through the deployed app,
before restoring Access to invited users:

- [ ] **Identity**: sign in via Cf-Access; the app loads without a 401 and
      shows the owner's own data (not a demo/empty state).
- [ ] **Migrated data**: spot-check a handful of known transactions,
      accounts, and the current year's budget/goals against the pre-cutover
      values recorded from step 2's export.
- [ ] **Write**: create a transaction (or any single mutation) and confirm it
      persists after a page reload — exercises `POST /api/sync` end to end.
- [ ] **Conflict**: from two open sessions/tabs, edit the same entity
      concurrently and confirm the `ConflictResolutionDialog` appears and a
      resolution is applied cleanly (no silent auto-merge).
- [ ] **Offline**: toggle network off in devtools, perform a CRUD action,
      toggle network back on, confirm the outbox flushes without duplicating
      the change.
- [ ] **Export**: `GET /api/data/export` returns the full dataset and
      excludes `integration_credentials` (confirm no plaintext or ciphertext
      credential field appears in the response).
- [ ] **Logout**: log out and confirm IndexedDB is wiped (`indexedDB.databases()`
      in devtools shows no finance-tracker database left).

If any item fails: **abort criterion** — do not open Access to other users;
go to §8.

## 8. Abort criteria & rollback

Abort and roll back if, at any point up to and including step 7:

- The migration tool (step 4) reports any anomaly or exits non-zero.
- `validate-migration-parity` (step 5) reports any discrepancy or exits
  with code `1`.
- Any item in the step 7 owner verification checklist fails.
- Any unexpected error surfaces in logs/Sentry during steps 4-7.

Rollback procedure:

1. **If v2 received no real user writes yet** (i.e. failure was caught before
   or during step 7, only the migrated data is in v2 — no new owner writes
   layered on top): simply redeploy the pre-cutover build (previous deploy,
   `AUTH_ENFORCED` back to unset/`false`, `PUBLIC_SYNC_V2` back to unset/
   `false`) and confirm the app serves the legacy path against
   `finance_tracker_db` again. v1 was never modified, so this alone restores
   full service.
2. **If v2 already received writes from the owner** (failure discovered
   later, e.g. during step 7's own testing before deciding to abort): first
   export v2 back to a v1-shaped JSON snapshot so those writes aren't lost:
   ```
   pnpm migrate:export-v1-json -- \
     --v2-sqlite=.data/finance-tracker-v2-cutover.sqlite \
     --email=<LEGACY_OWNER_EMAIL value> \
     --out=.data/rollback-v2-to-v1.json
   ```
   Review this file, reconcile/merge it with the v1 data manually (or via
   the legacy `PUT /api/state`-shaped import path) if needed, *then* redeploy
   the pre-cutover build as in step 1.
   - Note: `export-v2-to-v1-json.ts` reads from a **local** v2 sqlite file,
     not directly from remote D1. If the writes only exist in the remote v2
     database (e.g. real production traffic during a partial cutover),
     first pull it down: `wrangler d1 export finance-tracker-db-v2 --remote --output=.data/v2-rollback-dump.sql`,
     load that SQL into a local sqlite file, then point `--v2-sqlite` at it.
3. If v1 itself needs restoring to its pre-window state (should not be
   necessary since v1 was never written to during the window — only
   relevant if the Access-policy block in step 1 somehow failed to hold):
   restore using the Time Travel bookmark recorded in step 2:
   ```
   wrangler d1 time-travel restore finance-tracker-db --bookmark=<bookmark-id>
   ```
4. Re-open Access to the owner-user, confirm service restored, then debug
   the failure offline before scheduling a new attempt.

## 9. Open Access to invited users

Once step 7 passes in full:

1. In the Cloudflare Zero Trust dashboard, restore/extend the Access policy
   to the intended set of invited users (beyond just the migration
   operator + owner).
2. Exit the maintenance window; announce completion.

## 10. Post-cutover monitoring (first 30 days)

See `docs/migration/retention-checklist.md` for the full 30-day v1 retention
and decommission process. Monitoring thresholds below are against D1 Free
tier quotas (500 MB storage, 5,000,000 reads/day, 100,000 writes/day per
account) for the **v2** database, `finance-tracker-db-v2`:

| Metric | Free quota | Watch (60%) | Warn (75%) | Alert (90%) | Escalation trigger |
|---|---|---|---|---|---|
| Storage | 500 MB | 300 MB | 375 MB | 450 MB | 400 MB — start planning a paid-plan upgrade or data pruning |
| Reads/day | 5,000,000 | 3,000,000 | 3,750,000 | 4,500,000 | sustained rate implying >80% by day's end |
| Writes/day | 100,000 | 60,000 | 75,000 | 90,000 | 80,000 — investigate write amplification (e.g. runaway outbox retries) immediately |

Check via `wrangler d1 info finance-tracker-db-v2` (storage) and the
Cloudflare dashboard's D1 analytics (reads/writes/day) daily for the first
week of the retention window, then at least weekly for the remainder of the
30 days. Given this is currently a single-tenant deployment, hitting any
"Alert" threshold before Access is opened to more users indicates a bug
(e.g. a retry loop), not organic growth — treat as a P1 regardless of the
escalation-trigger wording above.
