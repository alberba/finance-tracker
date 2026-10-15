# Work Package Breakdown — Migración relacional multiusuario sobre Cloudflare D1

> Plan histórico de la migración ya ejecutada. Las tareas y comandos v1 de este documento
> no describen el runtime actual; la transición se cierra según
> [retirada de v1](retention-checklist.md).

## Contradictions & gaps to flag before starting (read this first)

1. **No middleware exists at all.** `api-endpoints` map confirms zero `src/middleware.ts`, zero JWT/Cf-Access verification code anywhere in `src/`. The plan's "Middleware Astro valida Cf-Access-Jwt-Assertion" is net-new infrastructure, not a refactor — size accordingly (WP3).
2. **No auth boundary today.** Every `/api/state*`, `/api/market/*` route is unauthenticated; tenant isolation is a client-supplied `x-finance-namespace` header only. "Legacy state assigned to reserved user, linked once when `LEGACY_OWNER_EMAIL` accesses" needs a well-defined one-time linking transaction (WP3/WP7) since nothing like it exists.
3. **Two competing persistence paths already exist** (`client-state-sync` map): the real path (`src/scripts/state.ts` + `src/scripts/app.ts`) and a dead path (`src/services/state-api.ts`, unused `loadFromApi`/`saveToApi` on `financial-state.ts`). The plan's "IndexedDB reemplaza localStorage" work should delete the dead path rather than migrate it — flag explicitly in WP8/WP9 scope.
4. **Money is float everywhere, no Decimal lib.** `round2`/`round8` ad hoc rounding is baked into `finance-core.ts` and every `domain/*` consumer. The plan's "dinero como enteros + decimal canónico" is a full data-layer semantic change that the _entire_ domain/calculation layer (`src/domain/**`, `src/lib/finance-core.ts`) must absorb, not just storage. This is understated in the plan as a storage detail — it is actually a domain-layer rewrite (WP2/WP6/WP9 interlock).
5. **No real D1 test tier.** `tests/unit/d1-state.test.ts`'s `createFakeD1()` only understands 3 SQL shapes (CREATE TABLE, SELECT by id, INSERT...ON CONFLICT). A ~20-table relational schema cannot be validated by this fake — the plan's "integración D1" testing requirement needs a new local-D1/Miniflare-backed test tier (explicit deliverable in WP1/WP10, currently absent from the plan's assumption list).
6. **CI does not gate unit/lint/check/build**, only Playwright (`.github/workflows/playwright.yml`). The plan's "Validación final" list (migraciones locales, unit, integración D1, Playwright, astro check, lint, build) will not be enforced automatically unless CI is extended — recommend adding this as an explicit WP10 sub-task, otherwise the migration can silently regress on merge.
7. **Stock Events API key currently lives in plaintext** inside the `app_state.payload` JSON blob (`domain-services` map, §5). The plan's "credenciales cifradas AES-GCM" requirement is a genuine encrypt-at-rest change for a field that has never been encrypted — migration script (WP9) must decrypt-write it, not just copy it.
8. **`GET /api/state` currently has a write side effect** (auto-seeds on miss) — the new `GET /api/bootstrap`/`GET /api/changes` must not silently create rows on GET either; call this out as an API design constraint in WP4.
9. **Export/rollback direction risk**: `applyContributionSave` in `src/domain/investment/contributions.ts` mutates its `draft` argument in place — any repository-layer wrapper reusing this function (WP6) must clone before mutating, or v2 repositories will get non-deterministic partial writes.

---

## Dependency graph (overview)

```
WP1 (schema+drizzle+migrations) ──┬─▶ WP2 (money/decimal core) ──▶ WP6 (repositories)
                                    ├─▶ WP3 (identity+middleware)         │
                                    └─▶ WP5 (D1 test tier)                │
WP3 ──▶ WP4 (sync/API routes) ◀───────────────────────────────────────────┘
WP4 ──▶ WP7 (client IndexedDB+Pinia rewrite) ──▶ WP8 (demo/bootstrap UX)
WP1+WP2 ──▶ WP9 (legacy→v2 migration tool + rollback exporter)
WP4+WP7+WP9 ──▶ WP10 (test suite: security/offline/E2E/CI gating)
WP10 ──▶ WP11 (cutover runbook + 30-day dual-write/retention window)
(optional) WP12 (encrypted credentials: AES-GCM for Stock Events key + integration_credentials) — can run parallel to WP6/WP7 once WP1 lands
```

---

## WP1 — Relational schema, Drizzle setup, versioned migrations

**Goal**: Stand up `finance-tracker-db-v2` (D1 Free), full Drizzle TS schema for all 21 tables, initial SQL migration set, migration tooling wired into `package.json`/wrangler.

**Files**:

- Create: `drizzle/schema.ts` (or `src/db/schema/*.ts` split per domain), `drizzle.config.ts`
- Create: `migrations-v2/0001_init_v2.sql` (new `migrations_dir` for the new DB, keep old `migrations/` untouched for v1)
- Modify: `wrangler.toml` — add second `[[d1_databases]]` block, binding e.g. `finance_tracker_db_v2`, `database_name = "finance-tracker-db-v2"`, `migrations_dir = "migrations-v2"`
- Modify: `src/lib/server/cloudflare-env.ts` — add `finance_tracker_db_v2` to `RuntimeEnv`
- Modify: `package.json` — `d1:migrate:local:v2` / `d1:migrate:remote:v2` scripts
- Create: `src/db/client.ts` (Drizzle D1 client factory analogous to `getD1FromLocals`)

**Key design decisions (fixed by plan)**:

- All 21 tables per plan list; every table has `user_id` FK; money columns are `INTEGER` (minimal unit) + separate `currency TEXT` ISO column, never `REAL`.
- UUIDv7 generated server-side for all PKs; legacy IDs preserved in a `legacy_id` column where applicable (needed by WP9 parity checks).
- Minimal indexes only: `(user_id)` on every table, `(user_id, <natural lookup key>)` where query patterns demand it (documented per table in schema comments) — do not add speculative indexes.

**Acceptance criteria**:

- `wrangler d1 migrations apply finance-tracker-db-v2 --local` applies cleanly from empty.
- `drizzle-kit check`/`generate` produces no drift between schema.ts and migration SQL.
- New unit test `tests/unit/schema-v2.test.ts` asserts every table has `user_id` and correct money column types via `PRAGMA table_info`.

**Size**: L

---

## WP2 — Canonical money/decimal layer

**Goal**: Introduce the canonical decimal library and integer-minimal-unit conversion helpers that all v2 repositories and (eventually) domain calculations will use; do NOT yet touch `src/domain/**` call sites (that's WP6).

**Files**:

- Create: `src/lib/server/money.ts` (or similar) — `toMinorUnits(amount, currency)`, `fromMinorUnits(minor, currency)`, wrapping the chosen decimal library (e.g. `decimal.js`); replaces ad hoc `round2`/`round8` for the v2 write/read boundary only
- Reference (do not modify yet): `src/lib/number.ts`, `src/lib/finance-core.ts` (three re-export paths for `round2` — pick ONE canonical import path now, per `domain-services` map finding #6, and record the decision so WP6 doesn't re-litigate it)
- Create: `tests/unit/money.test.ts`

**Key design decisions**:

- Money is integer minimal unit (cents) + ISO currency at the storage/API boundary only; domain calculation layer continues in float internally until WP6 decides scope (flag: full domain rewrite to decimal is a stretch goal, not required for correctness if conversion happens at repository read/write boundary — **this narrows the plan's ambition and should be confirmed with the user**).
- `round8` (crypto units) stays as a distinct concern from money rounding — not unified.

**Acceptance criteria**: `pnpm test:unit -- money.test.ts` green; round-trip property test (`toMinorUnits(fromMinorUnits(x)) === x`) for representative currencies (EUR, USD, BTC-style high precision if applicable).

**Size**: S — depends on nothing, can start immediately, parallel with WP1.

---

## WP3 — Identity, Cf-Access middleware, AuthPrincipal

**Goal**: Build the Astro middleware from scratch (none exists today), `users`/`user_identities` tables, JWT/JWKS verification, legacy-owner one-time linking.

**Files**:

- Create: `src/middleware.ts` — new file, Astro `onRequest` hook, validates `Cf-Access-Jwt-Assertion` header via JWKS (issuer/audience check), populates `Astro.locals.principal: AuthPrincipal`
- Create: `src/lib/server/auth/jwks.ts` (fetch+cache JWKS), `src/lib/server/auth/principal.ts` (types + first-auth user/identity provisioning)
- Modify: `src/db/schema/users.ts`, `user_identities.ts` (part of WP1's schema, but the _provisioning logic_ lives here)
- Create: `src/lib/server/auth/legacy-owner-link.ts` — one-time linking to `LEGACY_OWNER_EMAIL` reserved user
- Modify: `src/lib/server/cloudflare-env.ts` — add `LEGACY_OWNER_EMAIL`, JWKS/issuer/audience env vars to `RuntimeEnv`
- Create: `tests/unit/auth-middleware.test.ts` (mocked JWKS)

**Key design decisions**:

- UUIDv7 for `users.id`; every domain table FKs to this, never to provider subject.
- First successful auth for a not-yet-seen `(provider, subject)` creates `users` + `user_identities` rows transactionally.
- Legacy state's reserved user is created during WP9 migration, linked (identity attached) only on first real access matching `LEGACY_OWNER_EMAIL` — must be idempotent (repeat logins after linking are no-ops).
- `Astro.locals` is the only source of `user_id` server-side; **client never supplies user_id** (per plan) — this must be enforced in every WP4 route via the middleware-populated locals, not query/body params.

**Acceptance criteria**: unit tests for JWT valid/expired/invalid/wrong-audience; E2E smoke test hitting a protected route without the header → 401.

**Size**: L — genuinely new subsystem (see Contradiction #1/#2), depends on WP1 (users/user_identities tables) only for schema, can be developed in parallel against a stub schema.

---

## WP4 — Sync API surface (bootstrap/changes/sync/state lifecycle)

**Goal**: Replace `src/pages/api/state.ts` + `state/reset.ts` with the new endpoint set: `GET /api/session`, `GET /api/bootstrap`, `GET /api/changes`, `POST /api/sync`, `POST /api/state/initialize`, `POST /api/state/reset`, `GET /api/data/export`, `POST /api/data/import`.

**Files**:

- Create: `src/pages/api/session.ts`, `src/pages/api/bootstrap.ts`, `src/pages/api/changes.ts`, `src/pages/api/sync.ts`
- Modify/replace: `src/pages/api/state/reset.ts` → new semantics (per-user "empezar de cero" seed, not namespace-blob reset); `src/pages/api/state/initialize.ts` (new)
- Create: `src/pages/api/data/export.ts`, `src/pages/api/data/import.ts`
- Delete (superseded): `src/pages/api/state.ts` (GET/PUT whole-blob), `src/lib/server/d1-state.ts` (superseded by WP6 repositories) — **retain until WP9/WP11 cutover complete**, do not delete prematurely
- Modify: `src/lib/server/state-request.ts` — namespace-header logic (`x-finance-namespace`) is replaced by `Astro.locals.principal.userId`; demo namespace becomes a dedicated read-only demo dataset (see WP8), not a header-selected D1 row
- Create: `src/lib/server/sync/command-schemas.ts` (Zod discriminated union for the 5 sync command payload shapes, `commandId`, base version)
- Create: `src/lib/server/sync/apply-command.ts` (per-command transaction: ownership/version check, mutate, bump entity version + user revision, write `sync_changes`/`audit_events`, idempotency check via `commandId`)

**Key design decisions**:

- `POST /api/sync` batches ≤5 commands; each is its own D1 transaction; first 409 (version conflict) halts remaining commands in the batch (explicit fail-fast semantics from the plan).
- `user_revisions` is the cursor `GET /api/changes?since&cursor` walks; `sync_commands`/`sync_changes` provide idempotency + audit trail.
- No GET route may write as a side effect (fixes Contradiction #8) — `bootstrap`/`session`/`changes` are pure reads; seeding happens only via explicit `POST /api/state/initialize`.

**Acceptance criteria**: contract tests per endpoint (Zod validation 400s, 409 conflict body shape, idempotent replay of same `commandId` returns prior result not a duplicate mutation); `astro check` clean.

**Size**: L — depends on WP1 (schema), WP3 (locals.principal), WP2 (money conversion at API boundary).

---

## WP5 — Real D1 test tier (Miniflare/local-D1 backed)

**Goal**: Close the gap flagged in `tests-tooling` map: `createFakeD1()` only supports 3 SQL shapes and cannot validate a 21-table schema.

**Files**:

- Create: `tests/integration/d1-v2/` directory, `tests/integration/d1-v2/setup.ts` (spins a local D1 SQLite instance via `wrangler d1 execute --local` or Miniflare bindings, applies `migrations-v2/`)
- Create: `vitest.integration.config.ts` (separate from `vitest.config.ts`, since `tests-tooling` confirms unit config scopes `tests/unit/**` only)
- Modify: `package.json` — `test:integration` script, `.github/workflows/playwright.yml` (or new workflow) to run it in CI

**Key design decisions**: this tier tests repositories (WP6) and API routes (WP4) against a real SQLite engine, not a hand-rolled shape-matcher — required because the plan's index/FK/query-plan tests cannot be done against `createFakeD1()`.

**Acceptance criteria**: a sample repository test (e.g. `accounts` CRUD + FK violation rejected) passes against real local D1; CI job runs it green.

**Size**: M. Depends on WP1 only; fully parallelizable with WP2/WP3.

---

## WP6 — Drizzle repositories (single D1 access layer)

**Goal**: Implement repository modules — the _only_ code allowed to touch D1 directly per the plan ("Drizzle... como única capa de acceso a D1") — covering all 21 tables, consumed by WP4's routes.

**Files**:

- Create: `src/db/repositories/*.ts` — one per aggregate (accounts, transactions, categories, subscriptions, recurring-rules, pending-movements, budget-entries, goals, wealth-snapshots+snapshot-balances, contributions+contribution-allocations, market-instruments+user-instruments+market-quotes, integration-credentials, stockevents-symbol-mappings, user-revisions, sync-commands+sync-changes, audit-events, user-settings)
- Modify: `src/domain/investment/contributions.ts` — `applyContributionSave`'s in-place `draft` mutation must be replaced with a pure function before any repository wraps it (Contradiction #9); this is the one `src/domain/**` file WP6 must touch directly, everything else in `domain-services` map stays float/in-memory and is fed already-converted values by the repository boundary
- Create: `tests/unit/repositories/*.test.ts` + `tests/integration/d1-v2/repositories/*.test.ts` (using WP5's tier)

**Key design decisions**:

- Repositories are the sole caller of Drizzle; API routes (WP4) never issue raw SQL.
- Every repository method takes `userId` explicitly (never trusts a global/ambient value) — enforces "todas las tablas privadas con user_id" defensively at the code level, not just schema level.
- Money conversion (WP2 helpers) happens at repository read/write boundary, so `src/domain/**` keeps operating on floats unchanged (narrows blast radius vs. Contradiction #4 — confirm this scoping decision with user before WP6 starts).

**Acceptance criteria**: 100% of tables have a repository with CRUD + at least one FK-violation test + one cross-user-isolation test (`user A cannot read/write user B's row`).

**Size**: L. Depends on WP1, WP2, WP5.

---

## WP7 — Client: IndexedDB cache, outbox, Pinia rewrite

**Goal**: Replace `localStorage` (`src/scripts/state.ts`) with IndexedDB (per-identity cache, persistent ordered outbox, non-extractable Web Crypto encryption), retire the dead `src/services/state-api.ts` path, fold `src/scripts/app.ts`'s sync engine into Pinia.

**Files**:

- Delete: `src/services/state-api.ts`; remove dead `loadFromApi`/`saveToApi` from `src/stores/financial-state.ts` (Contradiction #3)
- Rewrite: `src/scripts/state.ts` → new `src/lib/client/idb-cache.ts` (IndexedDB store, keyed by user identity), `src/lib/client/outbox.ts` (persistent ordered command queue mirroring WP4's sync-command schema)
- Rewrite: `src/scripts/app.ts` + `src/scripts/app/state-format-helpers.ts` — retire imperative bootstrap, move retry/backoff/coalescing/conflict logic into `src/stores/financial-state.ts` (or a new `src/stores/sync.ts`), matching plan's "Pinia estado normalizado por entidad, revisión, conexión, outbox y conflictos"
- Modify: every domain store (`src/stores/movements.ts`, `investment.ts`, `market.ts`, `stockevents.ts`, `recurring.ts`, `settings.ts`, `budget.ts`, `goals.ts`, `wealth.ts`, `data.ts`) — `commitState` now enqueues a discrete sync command (per entity mutation) instead of a whole-state diff, to match WP4's per-command `/api/sync` contract
- Create: `src/lib/client/crypto.ts` — Web Crypto non-extractable key handling, logout wipe
- Modify: menu/nav component (locate via `dashboard.ts`'s `controllerActions` bridge) — add email, sync status, demo, logout

**Key design decisions**:

- Optimistic update + outbox + sync is identical online/offline (no special-cased "offline mode").
- Financial conflicts are never auto-merged — UI presents local vs server, user picks (new conflict-resolution component needed, not in current `client-state-sync` map — net-new UI).
- Full IndexedDB wipe on logout.
- Security/credential operations (Stock Events key, etc.) require a live connection — must explicitly block when offline (guard in `src/stores/stockevents.ts`).

**Acceptance criteria**: offline CRUD via Playwright (network conditions toggled), outbox replays without duplication, conflict UI appears on simulated concurrent edit, logout clears IndexedDB (assert via `indexedDB.databases()`).

**Size**: L. Depends on WP4 (sync contract) and WP3 (identity for cache keying). This is the largest single-file-count WP — consider splitting further if a second engineer is available (cache/outbox vs. store rewrite vs. conflict UI).

---

## WP8 — Demo (read-only) & "Empezar de cero" flows

**Goal**: Replace the current namespace-header-based `demo` (`src/data/demo-seed.ts`, `resolveRuntimeNamespace()` in `src/scripts/demo-mode.ts`) with a code-generated global read-only demo dataset, and implement the private "start fresh" initialize flow.

**Files**:

- Modify: `src/data/demo-seed.ts` — becomes the source for a build-time/deploy-time generated global demo dataset (not a D1 row created on first request)
- Modify/retire: `src/scripts/demo-mode.ts` — demo becomes an auth-mode (unauthenticated preview) rather than a namespace header
- Wire to: `POST /api/state/initialize` (WP4) — "empezar de cero" creates the private space: current year, EUR, basic categories, budgets/goals zeroed, no accounts/transactions
- Modify: E2E `tests/e2e/fixtures.ts` — namespace-per-test pattern (currently `x-finance-namespace`) must be replaced with a per-test **test user** provisioning pattern (mint a test JWT or bypass via a test-only auth shim) — significant rework of the one reusable E2E asset flagged in `tests-tooling` map

**Key design decisions**: demo is global and read-only (no per-visitor D1 writes, unlike today's demo namespace which is a real writable row); "empezar de cero" is the only path that creates a brand-new private user space with the specified defaults.

**Acceptance criteria**: demo mode passes E2E without any D1 write; new-user initialize flow produces exactly the specified default state; existing `tests/e2e/fixtures.ts` namespace helper is replaced and all specs referencing it pass under the new auth-fixture.

**Size**: M. Depends on WP4, WP7.

---

## WP9 — Legacy JSON → v2 migration tool + rollback exporter

**Goal**: Repeatable tool reading `app_state.default`/`current` (`src/lib/server/d1-state.ts`, `migrations/0002_import_seeded_state.sql`), normalizing via existing `normalizeState()` (`src/scripts/state.ts`), converting money to minimal units (WP2), bulk-inserting transactionally into v2, producing counts/checksums/anomaly report; plus inverse v2→v1 JSON exporter.

**Files**:

- Create: `scripts/migrate-v1-to-v2.mjs` (or `.ts` via tsx) — reads v1 D1 (`finance_tracker_db`), reuses `normalizeState()` from `src/scripts/state.ts` for shape validation, writes via WP6 repositories
- Create: `scripts/export-v2-to-v1-json.mjs` — inverse exporter for rollback
- Create: `scripts/validate-migration-parity.mjs` — counts, monthly totals, wealth-per-snapshot, budget/goals/investment-metric parity checks (compare `finance-core.ts` outputs computed over v1 state vs. equivalent v2-derived values)
- Reference: `scripts/export-sqlite-to-d1.mjs` (existing pattern for D1 read/write scripting, reuse its `node:sqlite` `DatabaseSync` approach for local dry-runs)
- Create: `tests/unit/migration-tool.test.ts` — exactness (money conversion), repeatability (idempotent re-run), atomic failure (partial-batch rollback on error)

**Key design decisions**:

- Reserved "legacy owner" user created here (consumed by WP3's linking logic).
- Stock Events API key: decrypt-from-plaintext (Contradiction #7) and re-encrypt via WP12's AES-GCM before insert into `integration_credentials`.
- Migration must be transactional and re-runnable without duplication (checksum/anomaly report as the audit artifact).

**Acceptance criteria**: `pnpm migrate:v1-to-v2 --dry-run` produces a parity report with zero discrepancies against a snapshot of current `app_state.default`; re-running the tool twice produces identical output (no duplicate rows); a forced mid-batch failure leaves v2 DB unchanged (atomicity test).

**Size**: L. Depends on WP1, WP2, WP6 (repositories), WP3 (reserved user concept).

---

## WP10 — Full test suite + CI gating

**Goal**: Close the gaps in `tests-tooling` map: security tests (JWT/cross-tenant/credential-leak), offline convergence tests, E2E isolation A/B, and — critically — get `test:unit`, `lint`, `check`, `build`, and the new integration tier into CI (currently only Playwright runs, per Contradiction #6).

**Files**:

- Create: `tests/unit/security/*.test.ts` (invalid/expired JWT, no cross-account access by guessing IDs, credentials absent from API responses/logs/export/cache)
- Create: `tests/e2e/multi-user-isolation.spec.ts` (A/B account isolation, owner retains data across sessions)
- Create: `tests/e2e/offline-sync.spec.ts` (CRUD without network, retry without duplicates, cross-device conflict visible)
- Modify: `.github/workflows/playwright.yml` (or new `.github/workflows/ci.yml`) — add `pnpm test:unit`, `pnpm lint`, `pnpm check`, `pnpm build`, `pnpm test:integration` (WP5's tier), `d1:migrate:local:v2` verification step
- Modify: `tests/e2e/pages/FinanceTrackerPage.ts` — extend POM for new sync-status UI, conflict-resolution dialog, menu (email/sync/demo/logout)

**Acceptance criteria**: CI workflow runs all six gates on every PR; security test suite green; offline E2E passes with simulated network toggling.

**Size**: M. Depends on WP4, WP7, WP9 substantially complete (needs real endpoints/UI to test against) — this is the integration checkpoint, largely sequential.

---

## WP11 — Cutover runbook & retention window

**Goal**: Single-maintenance-window cutover procedure, v1 kept intact and readable for 30 days, monitoring/rollback trigger criteria.

**Files**:

- Create: `docs/migration/cutover-runbook.md` (or wherever project runbooks live) — step order: maintenance mode → run WP9 migration tool → run `validate-migration-parity.mjs` → flip `wrangler.toml` primary binding / DNS·routing to v2 stack → smoke test → exit maintenance mode
- Modify: `wrangler.toml` — after cutover, v1 `finance_tracker_db` binding stays declared (read-only reference) for 30 days, `migrations/` directory untouched
- Create: retention-window checklist (who/when decommissions v1, using `export-v2-to-v1-json.mjs` as the rollback lever if needed within the window)

**Acceptance criteria**: dry-run of the runbook executed against a staging copy; rollback path (v2→v1 export + DNS/binding revert) exercised at least once before real cutover.

**Size**: S (mostly process/doc), but **cannot start until WP9 + WP10 are green**.

---

## WP12 — Encrypted credentials (AES-GCM, integration_credentials)

**Goal**: Versioned AES-GCM encryption for `integration_credentials` (Stock Events key today; future integrations), keyed by `DATA_ENCRYPTION_KEY`.

**Files**:

- Create: `src/lib/server/crypto/data-encryption.ts` — versioned AES-GCM encrypt/decrypt, key from `DATA_ENCRYPTION_KEY` env var
- Modify: `src/lib/server/cloudflare-env.ts` — add `DATA_ENCRYPTION_KEY` (+ version) to `RuntimeEnv`
- Modify: `src/db/repositories/integration-credentials.ts` (from WP6) — encrypt on write, decrypt on read, never log/export plaintext
- Modify: `src/pages/api/stockevents/_helpers.ts`, `src/lib/server/stockevents.ts` — source the key from the encrypted repository instead of the whole-state JSON blob (fixes Contradiction #7)
- Create: `tests/unit/security/credentials-encryption.test.ts` — ciphertext at rest, absent from logs/export/API responses in plaintext, key-version rotation

**Acceptance criteria**: DB row inspection shows only ciphertext; export/import (WP4's `/api/data/export`) never emits decrypted credential values.

**Size**: S. Depends on WP1 (schema), WP6 (repository pattern) — can run in parallel with WP7/WP8 once those land.

---

## Parallelization in isolated worktrees

Safe to run concurrently (non-overlapping files, only shared dependency is merged schema/contracts from WP1):

- **Worktree A**: WP2 (money lib) — touches only new `src/lib/server/money.ts`, zero contention.
- **Worktree B**: WP3 (middleware/identity) — new files under `src/middleware.ts`, `src/lib/server/auth/*`.
- **Worktree C**: WP5 (D1 test tier) — new `tests/integration/d1-v2/*`, `vitest.integration.config.ts`.
- **Worktree D**: WP12 (encryption) — new `src/lib/server/crypto/*`, can stub the repository interface until WP6 lands, then rebase.

Must be sequential (real file/contract overlap or hard dependency):

- WP1 → (A/B/C/D fan out) → WP6 → WP4 → WP7 → WP8 → WP9 → WP10 → WP11.
- WP4 and WP7 touch a shared contract (sync command schema) — do not worktree-parallelize these two against each other; WP7 must start from WP4's finalized Zod schemas.
- WP9 and WP10 both need WP6 repositories and WP4 endpoints fully merged — not parallelizable with WP6/WP4 (only with each other's non-overlapping sub-tasks, e.g. migration script vs. parity-report script, if split further).
