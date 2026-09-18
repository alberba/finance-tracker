/**
 * WP7b — thin translation layer from domain-store mutations to the
 * per-entity sync commands `useSyncStore().enqueueCommand()` expects
 * (`src/lib/server/sync/command-schemas.ts`).
 *
 * Design (documented per the WP7b assignment, "wire domain stores to
 * per-entity sync commands"):
 *
 * - Every exported function here is a no-op when `PUBLIC_SYNC_V2` is off
 *   (checked before touching Pinia/IndexedDB at all) — the legacy
 *   whole-blob `commitState` → `PUT /api/state` path (untouched by this
 *   file) is byte-identical either way.
 * - Domain stores keep mutating `financialStateStore.state` via
 *   `commitState` exactly as before; call sites call into this module
 *   *alongside* that (usually by snapshotting the relevant array
 *   before/after the `commitState` call and diffing — see
 *   `syncListDiff`), never instead of it. This is additive rather than a
 *   rewrite of the store layer — the least-invasive shape the assignment
 *   asked to prefer.
 * - Money amounts are NOT converted to minor units here. `entityCreateSchemas`
 *   /`entityUpdateSchemas` (`command-schemas.ts`) declare `amount` etc. as
 *   plain decimal `z.number()` — the same shape the domain layer already
 *   uses — because the v2 repository layer (`src/db/repositories/*`, WP6)
 *   does the integer-minor-unit conversion at the D1 read/write boundary,
 *   not at the API/command boundary. `src/lib/money.ts`'s own doc comment
 *   confirms this ("this module does not change any existing call site").
 *   So this file never imports it.
 *
 * Id/entity-reference correlation this module solves:
 *
 * An entity created from now on carries the identity the client minted for
 * it — a UUID sent as `data.id` in its `create`, which is its primary key in
 * D1 too (ADR 0001). The write path never invents a correlation id from the
 * entity's own data: `syncUpdate`/`syncRemove` address that same id, and
 * `getEntityRef` finds it directly in the local IndexedDB cache. The one
 * remaining use of the data-derived identifier is recognising a row that
 * came from v1, whose `legacyId` column still holds the v1 id the local
 * `State` knows it by — `getEntityRef` falls back to it only when no row
 * carries the requested id.
 *
 * Aggregates whose identity is a real natural key are matched on those
 * attributes instead (`syncUpsertByKey`): a category on its name+kind, a goal
 * on its key, a budget cell on `(categoryId, year, month)`, a snapshot on
 * `(year, month)`. Those are the entity's own columns, not a string agreed
 * between the client and the migrator.
 *
 * Anything not yet acknowledged is folded into its still-queued `create`
 * (`mergeIntoPendingCreate`/`cancelPendingCreate`) — see those functions' doc
 * comments in `src/stores/sync.ts`.
 *
 * Known, documented leftovers (exotic edge flows intentionally NOT covered
 * here — see the WP7b report for the full list):
 * - `resolveCategoryId`/`resolveEntityId` returning `null` because the
 *   referenced category/recurring-rule hasn't synced yet is passed through
 *   as `categoryId: null` where the schema allows it. Where the schema
 *   requires the field (`budgetEntry.categoryId`, `pendingMovement.recurringRuleId`),
 *   the command is skipped with a console warning instead of sent with a
 *   bogus value — the edit will sync on the next mutation of the same row
 *   once the dependency has caught up. This is an eventual-consistency gap
 *   for the "created dependency and dependent row in the same instant,
 *   offline" case, not a data-loss bug (nothing is ever double-applied or
 *   silently dropped from local state).
 * - `investment.ts`'s `saveContribution` syncs the `contribution` row with
 *   its flow allocations nested under `data.allocations`; the snapshot
 *   balances that same workflow save touches are not re-synced from there.
 * - `settings.ts`'s TWR liquidity toggle sends the whole selection through
 *   `syncTwrLiquidityAccounts` (a `settingsUpdate`), resolved to server
 *   `account` ids.
 * - `wealth.ts`'s `saveSnapshot` sync-upserts the `wealthSnapshot` row with
 *   its balances nested under `data.balances` (resolved to server `account`
 *   ids via `resolveEntityId`) — see `command-schemas.ts`'s doc comment for
 *   why `snapshot_balances` travels nested instead of as its own command.
 * - `market.ts`'s `instruments` conflates a global instrument definition
 *   (symbol/market/provider — `market_instruments`, an explicitly
 *   out-of-scope *global* reference table) with the per-user link
 *   (`user_instruments`: `instrumentId`/`categoryId`/`alias` only) and
 *   holdings tracking. Reconciling this needs a `market_instruments`
 *   materialization step this WP doesn't own — left unwired.
 * - `stockevents.ts` is entirely unwired on purpose: `integration_credentials`
 *   (WP12 owns encryption) and `stockevents_symbol_mappings` ("no version
 *   column to drive optimistic concurrency") are both explicitly excluded
 *   from `SYNC_ENTITY_TYPES` in `command-schemas.ts`.
 * - `settings.ts`'s three `EntityKey` values all map to the single v2
 *   `account` entity; the list shown in the UI determines its `kind`.
 * - `data.ts`'s import/reset/start-fresh flows use `reloadState` (whole
 *   blob), not `commitState`, and already have dedicated v2 endpoints
 *   (`/api/data/import`, `/api/state/reset`, `/api/state/initialize` via
 *   `state-initialize.ts`) — intentionally not routed through the sync
 *   command outbox.
 */

import { useSyncStore } from "../../stores/sync";
import type { SyncEntityType } from "../server/sync/command-schemas";
import { isSyncV2Enabled } from "./feature-flags";
import { newId } from "./ids";
import type { PendingCreateMatch } from "./outbox";

type JsonRecord = Record<string, unknown>;

/**
 * Predicate over a row: it selects a cached entity out of the local cache,
 * and separately matches a still-queued `create`'s payload. One type because
 * it is one concept — the identity the client can address an entity by,
 * before and after the server acknowledges it — and before/after forms of the
 * same entity always agree.
 */
export type EntityMatch = PendingCreateMatch;

/** Matches a still-queued `create` by the identity the client gave it. */
function identityMatch(id: string): EntityMatch {
  return (entity) => entity.id === id;
}

function warn(entityType: SyncEntityType, localId: string, verb: string): void {
  if (typeof console !== "undefined") {
    console.warn(
      `[sync-v2] No se pudo ${verb} "${entityType}" (id local "${localId}"): todavía no se ha sincronizado con el servidor.`,
    );
  }
}

/** Enqueues an `update` addressed at the server row a resolved ref points to. */
function enqueueUpdate(
  syncStore: ReturnType<typeof useSyncStore>,
  entityType: SyncEntityType,
  ref: { entityId: string; version: number },
  patch: JsonRecord,
): Promise<unknown> {
  return syncStore.enqueueCommand({
    action: "update",
    entityType,
    entityId: ref.entityId,
    baseVersion: ref.version,
    patch,
  });
}

/** Enqueues a `remove` addressed at the server row a resolved ref points to. */
function enqueueRemove(
  syncStore: ReturnType<typeof useSyncStore>,
  entityType: SyncEntityType,
  ref: { entityId: string; version: number },
): Promise<unknown> {
  return syncStore.enqueueCommand({
    action: "remove",
    entityType,
    entityId: ref.entityId,
    baseVersion: ref.version,
  });
}

/**
 * Enqueues a `create` command carrying the entity's own identity (`id`),
 * which the server stores as the row's primary key (ADR 0001) — re-sending
 * it is a no-op instead of a duplicate. No-op when sync-v2 is off.
 *
 * `data.id` wins over the `id` argument when the caller already minted one
 * (e.g. a category that another command in the same batch has to reference).
 */
export async function syncCreate(
  entityType: SyncEntityType,
  id: string,
  data: JsonRecord,
): Promise<void> {
  if (!isSyncV2Enabled()) {
    return;
  }
  const syncStore = useSyncStore();
  const entityId = typeof data.id === "string" && data.id ? data.id : id;
  await syncStore.enqueueCommand({
    action: "create",
    entityType,
    data: { ...data, id: entityId },
  });
}

/**
 * Enqueues an `update` for an already-synced entity, or folds the patch
 * into its still-queued `create` if it hasn't synced yet. Warns (does not
 * throw) if neither is found.
 */
export async function syncUpdate(
  entityType: SyncEntityType,
  localId: string,
  patch: JsonRecord,
): Promise<void> {
  if (!isSyncV2Enabled()) {
    return;
  }
  const syncStore = useSyncStore();
  const ref = await syncStore.getEntityRef(entityType, localId);
  if (ref) {
    await enqueueUpdate(syncStore, entityType, ref, patch);
    return;
  }
  const merged = await syncStore.mergeIntoPendingCreate(entityType, identityMatch(localId), patch);
  if (!merged) {
    warn(entityType, localId, "actualizar");
  }
}

/**
 * Enqueues a `remove` for an already-synced entity, or cancels the
 * still-queued `create` if the entity never synced. Warns if neither is
 * found.
 */
export async function syncRemove(entityType: SyncEntityType, localId: string): Promise<void> {
  if (!isSyncV2Enabled()) {
    return;
  }
  const syncStore = useSyncStore();
  const ref = await syncStore.getEntityRef(entityType, localId);
  if (ref) {
    await enqueueRemove(syncStore, entityType, ref);
    return;
  }
  const cancelled = await syncStore.cancelPendingCreate(entityType, identityMatch(localId));
  if (!cancelled) {
    warn(entityType, localId, "eliminar");
  }
}

/**
 * Create-if-absent, update-otherwise — for aggregates whose identity is a
 * real natural key (`matches` over the row's own columns) rather than the
 * UI-visible "add"/"edit" distinction: a category (name+kind), a goal
 * (key), a budget cell `(categoryId, year, month)`, a snapshot
 * `(year, month)`.
 *
 * `updateData` (defaults to `data`) is what's sent as the `update` patch —
 * distinct from `data` for an entity whose identity is a natural key that
 * must never travel in an update, like a budget cell's `(categoryId, year,
 * month)` (`entityUpdateSchemas.budgetEntry` only declares `amount`/
 * `currency`): the caller passes the full create-shaped `data` for the first
 * write and a narrower `updateData` for the edits that follow.
 *
 * The `create` carries a client-minted UUID as `data.id` when the caller
 * supplied one, and one is minted here otherwise (ADR 0001) — the local id
 * *is* the row's primary key, so nothing correlates the two afterwards.
 */
export async function syncUpsertByKey(
  entityType: SyncEntityType,
  matches: EntityMatch,
  data: JsonRecord,
  updateData: JsonRecord = data,
): Promise<void> {
  if (!isSyncV2Enabled()) {
    return;
  }
  const syncStore = useSyncStore();
  const ref = await syncStore.findEntityRef(entityType, matches);
  if (ref) {
    await enqueueUpdate(syncStore, entityType, ref, updateData);
    return;
  }
  const merged = await syncStore.mergeIntoPendingCreate(entityType, matches, data);
  if (merged) {
    return;
  }
  await syncCreate(entityType, newId(), data);
}

/**
 * Removes an entity addressed by its natural key: the synced row, or its
 * still-queued `create` if it never crossed. Warns if neither is found.
 */
export async function syncRemoveByKey(
  entityType: SyncEntityType,
  matches: EntityMatch,
  label: string,
): Promise<void> {
  if (!isSyncV2Enabled()) {
    return;
  }
  const syncStore = useSyncStore();
  const ref = await syncStore.findEntityRef(entityType, matches);
  if (ref) {
    await enqueueRemove(syncStore, entityType, ref);
    return;
  }
  const cancelled = await syncStore.cancelPendingCreate(entityType, matches);
  if (!cancelled) {
    warn(entityType, label, "eliminar");
  }
}

/** `user_settings` singleton update — no entity id/version to resolve. */
export async function syncSettingsUpdate(patch: {
  currency?: string;
  locale?: string | null;
  theme?: string | null;
  twrLiquidityAccountIds?: string[];
}): Promise<void> {
  if (!isSyncV2Enabled()) {
    return;
  }
  const syncStore = useSyncStore();
  await syncStore.enqueueCommand({ action: "settingsUpdate", patch });
}

/**
 * Resolves a local id to its server entity id only (no create-if-missing) —
 * for referencing a *different* aggregate as a foreign key (e.g. a pending
 * movement's parent recurring rule). Returns `null` if unresolved; callers
 * decide whether that's acceptable (optional FK) or means the command must
 * be skipped (required FK).
 */
export async function resolveEntityId(entityType: SyncEntityType, localId: string): Promise<string | null> {
  if (!isSyncV2Enabled()) {
    return null;
  }
  const syncStore = useSyncStore();
  const ref = await syncStore.getEntityRef(entityType, localId);
  return ref?.entityId ?? null;
}

/**
 * Sends the whole TWR liquidity selection, resolved to server `account` ids.
 * An account that hasn't synced yet is left out with a warning; the next
 * toggle sends it once it has.
 */
export async function syncTwrLiquidityAccounts(localAccountIds: readonly string[]): Promise<void> {
  if (!isSyncV2Enabled()) {
    return;
  }
  const twrLiquidityAccountIds: string[] = [];
  for (const localId of localAccountIds) {
    const accountId = await resolveEntityId("account", localId);
    if (accountId) {
      twrLiquidityAccountIds.push(accountId);
    } else {
      warn("account", localId, "marcar como liquidez TWR");
    }
  }
  await syncSettingsUpdate({ twrLiquidityAccountIds });
}

export type CategoryKind = "income" | "expense" | "investment";

/**
 * Matches a cached category by the attributes that identify it: its name
 * within its kind. Those are the row's own columns, not the
 * `${kind}:${name}` string the write path used to correlate by (ADR 0001).
 */
function categoryMatches(kind: CategoryKind, name: string): EntityMatch {
  return (category) => category.kind === kind && category.name === name;
}

/**
 * Resolves a cached row to its server entity id only, by attributes rather
 * than by id — the match-based counterpart of `resolveEntityId`. Returns
 * `null` when nothing matches, or when sync-v2 isn't ready.
 */
async function resolveEntityIdByMatch(
  entityType: SyncEntityType,
  matches: EntityMatch,
): Promise<string | null> {
  if (!isSyncV2Enabled()) {
    return null;
  }
  const ref = await useSyncStore().findEntityRef(entityType, matches);
  return ref?.entityId ?? null;
}

/**
 * Resolves (lazily create-syncing if necessary) the server `category` row
 * id for a legacy category *name* + kind. Returns `null` when the category
 * hasn't synced yet (freshly referenced in this same batch, or offline) —
 * see the module doc comment's "known leftovers" for how required-field
 * callers (`budgetEntry`) must handle that; those use
 * `resolveOrCreateCategoryId` instead.
 */
export async function resolveCategoryId(kind: CategoryKind, name: string): Promise<string | null> {
  if (!isSyncV2Enabled()) {
    return null;
  }
  const existing = await resolveEntityIdByMatch("category", categoryMatches(kind, name));
  if (existing) {
    return existing;
  }
  await syncUpsertByKey("category", categoryMatches(kind, name), { name, kind });
  return null;
}

/**
 * In-flight mints of a not-yet-synced category, keyed by its local id.
 * `resolveOrCreateCategoryId`'s own "is one already pending?" check
 * (`peekPendingCreateId`) only sees a mint once its `create` command has
 * actually been written to the outbox — an `await` away. Two budget cells
 * for the *same* brand-new category, edited back-to-back (e.g. filling in
 * January then February before either has synced), would otherwise both
 * observe "nothing pending yet" and each mint its own id, corrupting
 * whichever create actually lands. Every caller within this session awaits
 * the same in-flight mint instead.
 */
const pendingCategoryMints = new Map<string, Promise<string>>();

/**
 * Like `resolveCategoryId`, but never returns `null` for a genuinely new
 * category: `entityCreateSchemas.budgetEntry.categoryId` is required, so a
 * `null` here means silently dropping the edit (audit §4.7 — "la primera
 * edición de cada celda de presupuesto se pierde entera"), which is exactly
 * ticket #145's first acceptance criterion. Mints the category's id itself
 * (ADR 0001, "sin esperar al ack") instead of waiting for a round trip, so
 * the category's `create` and the budget entry's `create` land in the same
 * outbox flush — the category row exists by the time the entry references
 * it. A second reference before either has synced reuses the id already
 * minted for the pending category create (via the outbox, or — before that
 * create has even been written — via `pendingCategoryMints`) instead of
 * minting (and creating) a second one.
 */
export async function resolveOrCreateCategoryId(kind: CategoryKind, name: string): Promise<string | null> {
  if (!isSyncV2Enabled()) {
    return null;
  }
  const existing = await resolveEntityIdByMatch("category", categoryMatches(kind, name));
  if (existing) {
    return existing;
  }
  const matches = categoryMatches(kind, name);
  const syncStore = useSyncStore();
  const pendingId = await syncStore.peekPendingCreateId("category", matches);
  if (pendingId) {
    return pendingId;
  }
  // Memo key for the in-flight mint below. Purely local (never sent) — the
  // category's identity is the UUID minted here.
  const memoKey = `${kind}:${name}`;
  const inFlight = pendingCategoryMints.get(memoKey);
  if (inFlight) {
    return inFlight;
  }
  const mint = (async () => {
    const id = newId();
    await syncUpsertByKey("category", matches, { name, kind, id });
    return id;
  })();
  pendingCategoryMints.set(memoKey, mint);
  try {
    return await mint;
  } finally {
    pendingCategoryMints.delete(memoKey);
  }
}

/**
 * Create-if-absent / update-otherwise for a category, addressed by its real
 * name+kind.
 *
 * The name is the only key the local `State` model carries for a category
 * (`expenseCategories` is a plain name array, `CONTEXT.md`'s "Cuenta"/category
 * vocabulary), so a rename would still read as a new entity here — latent,
 * since no rename path exists (`settings.ts` exposes add/remove/reorder/emoji).
 * The row's *identity* is not name-derived: it is the id the client minted on
 * create (ADR 0001), and that id is what `update`/`remove` address.
 */
export async function syncCategoryUpsert(
  kind: CategoryKind,
  name: string,
  data: JsonRecord = {},
): Promise<void> {
  await syncUpsertByKey("category", categoryMatches(kind, name), { name, kind, ...data });
}

/** Removes a category addressed by its real name+kind. */
export async function syncCategoryRemove(kind: CategoryKind, name: string): Promise<void> {
  await syncRemoveByKey("category", categoryMatches(kind, name), name);
}

/** Create-if-absent / update-otherwise for a goal, addressed by its key. */
export async function syncGoalUpsert(key: string, data: JsonRecord): Promise<void> {
  await syncUpsertByKey("goal", (goal) => goal.key === key, data);
}

/**
 * Upserts one budget cell, addressed by the natural key that identifies it in
 * `budget_entries`: its category, year and month (ADR 0001). Its identity
 * never travels in the update patch — `entityUpdateSchemas.budgetEntry` only
 * declares `amount`/`currency`.
 */
export async function syncBudgetEntry(
  categoryId: string,
  year: number,
  month: number,
  amount: number,
  currency: string,
): Promise<void> {
  await syncUpsertByKey(
    "budgetEntry",
    (entry) => entry.categoryId === categoryId && entry.year === year && entry.month === month,
    { categoryId, year, month, amount, currency },
    { amount, currency },
  );
}

/**
 * Upserts a wealth snapshot, addressed by the year and month it belongs to
 * (ADR 0001). The snapshot's date is derived from those two, so they cannot
 * drift apart.
 */
export async function syncWealthSnapshot(
  year: number,
  month: number,
  balances: unknown,
): Promise<void> {
  await syncUpsertByKey(
    "wealthSnapshot",
    (snapshot) => snapshot.year === year && snapshot.month === month,
    { snapshotDate: `${year}-${String(month).padStart(2, "0")}-01`, year, month, balances },
  );
}

/**
 * Diffs a `{id}`-keyed array snapshot taken before/after a `commitState`
 * mutation and emits the corresponding `create`/`update`/`remove`
 * commands — the generic case for every list-shaped aggregate
 * (transactions, subscriptions, recurring rules, pending movements,
 * contributions). Bulk operations (multi-row edit/delete, subscription/
 * recurring-rule materialization) fall out of this for free: every row
 * that actually changed between the two snapshots gets its own command.
 *
 * `buildData` receives the current item and, for updates, its previous value
 * so callers can emit a minimal patch. It may return `null` to skip an item
 * (used when a required cross-entity reference — e.g. a pending movement's parent recurring rule
 * — hasn't synced yet) and otherwise must return plain JSON-serializable
 * data matching `entityCreateSchemas`/`entityUpdateSchemas` for
 * `entityType`.
 */
export async function syncListDiff<T extends { id: string }>(
  entityType: SyncEntityType,
  before: readonly T[],
  after: readonly T[],
  buildData: (item: T, previous?: T) => Promise<JsonRecord | null> | JsonRecord | null,
): Promise<void> {
  if (!isSyncV2Enabled()) {
    return;
  }
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterIds = new Set(after.map((item) => item.id));

  for (const id of beforeById.keys()) {
    if (!afterIds.has(id)) {
      await syncRemove(entityType, id);
    }
  }

  for (const item of after) {
    const prev = beforeById.get(item.id);
    if (prev && JSON.stringify(prev) === JSON.stringify(item)) {
      continue;
    }
    const data = await buildData(item, prev);
    if (data === null) {
      continue;
    }
    if (prev) {
      await syncUpdate(entityType, item.id, data);
    } else {
      await syncCreate(entityType, item.id, data);
    }
  }
}
