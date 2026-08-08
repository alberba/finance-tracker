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
 * Legacy `State` entities carry client-generated ids (`uid('tx')`,
 * category *names*, goal keys, budget-entry `(type, category, month)`
 * tuples, …), but v2 rows get a server-generated UUIDv7 `id` (WP1) with the
 * client's original id preserved in a `legacyId` column specifically so
 * this correlation is possible. `syncUpdate`/`syncRemove`/`syncUpsert`
 * resolve a local id to `{entityId, version}` via
 * `useSyncStore().getEntityRef()` (a scan of the local IndexedDB cache),
 * and fall back to folding the change into a still-unacknowledged `create`
 * command (`mergeIntoPendingCreate`/`cancelPendingCreate`) when the entity
 * hasn't synced yet — see those functions' doc comments in `src/stores/sync.ts`.
 *
 * Categories are a special case: legacy `State` has no category-id concept
 * at all (`incomeCategories`/`expenseCategories`/`investmentCategories`
 * are plain name arrays), while v2 has real `category` rows with server
 * ids. `resolveCategoryId` treats `${kind}:${name}` as the category's
 * stable `legacyId` and lazily create-syncs it the first time it's
 * referenced.
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
 * - `investment.ts`'s `saveContribution` (the multi-entity contribution +
 *   wealth-snapshot + snapshot-balances workflow save) is NOT wired: its
 *   domain function (`applyContributionSave`) produces a combined update
 *   spanning `contribution_allocations`/`snapshot_balances`, both
 *   explicitly out of the 11 `SYNC_ENTITY_TYPES` per `command-schemas.ts`'s
 *   own doc comment. Wiring it needs either a command-contract extension
 *   or decomposing that domain function's output — left as a follow-up.
 * - `wealth.ts`'s `saveSnapshot` only sync-upserts the `wealthSnapshot`
 *   *existence* row (snapshotDate/year/month); the actual balance edits
 *   (`snapshot.accounts/investments/liabilities`) map to `snapshot_balances`,
 *   also explicitly out of scope.
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
 * - `settings.ts`'s `EntityKey` values `investmentAssets`/`liabilities`
 *   have no corresponding v2 table/`SyncEntityType` today — only
 *   `accounts` is wired.
 * - `data.ts`'s import/reset/start-fresh flows use `reloadState` (whole
 *   blob), not `commitState`, and already have dedicated v2 endpoints
 *   (`/api/data/import`, `/api/state/reset`, `/api/state/initialize` via
 *   `state-initialize.ts`) — intentionally not routed through the sync
 *   command outbox.
 */

import { useSyncStore } from "../../stores/sync";
import type { SyncEntityType } from "../server/sync/command-schemas";
import { isSyncV2Enabled } from "./feature-flags";

type JsonRecord = Record<string, unknown>;

function warn(entityType: SyncEntityType, localId: string, verb: string): void {
  if (typeof console !== "undefined") {
    console.warn(
      `[sync-v2] No se pudo ${verb} "${entityType}" (id local "${localId}"): todavía no se ha sincronizado con el servidor.`,
    );
  }
}

/**
 * Enqueues a `create` command, tagging `data.legacyId` with the local id so
 * the server row can be correlated back to it later. No-op when sync-v2 is
 * off.
 */
export async function syncCreate(
  entityType: SyncEntityType,
  localId: string,
  data: JsonRecord,
): Promise<void> {
  if (!isSyncV2Enabled()) {
    return;
  }
  const syncStore = useSyncStore();
  await syncStore.enqueueCommand({
    action: "create",
    entityType,
    data: { ...data, legacyId: localId },
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
    await syncStore.enqueueCommand({
      action: "update",
      entityType,
      entityId: ref.entityId,
      baseVersion: ref.version,
      patch,
    });
    return;
  }
  const merged = await syncStore.mergeIntoPendingCreate(entityType, localId, patch);
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
    await syncStore.enqueueCommand({
      action: "remove",
      entityType,
      entityId: ref.entityId,
      baseVersion: ref.version,
    });
    return;
  }
  const cancelled = await syncStore.cancelPendingCreate(entityType, localId);
  if (!cancelled) {
    warn(entityType, localId, "eliminar");
  }
}

/**
 * Create-if-unknown, update-otherwise — for aggregates addressed by a
 * stable natural key (category `${kind}:${name}`, goal key, budget-entry
 * composite key) rather than a UI-visible "add"/"edit" distinction.
 */
export async function syncUpsert(
  entityType: SyncEntityType,
  localId: string,
  data: JsonRecord,
): Promise<void> {
  if (!isSyncV2Enabled()) {
    return;
  }
  const syncStore = useSyncStore();
  const ref = await syncStore.getEntityRef(entityType, localId);
  if (ref) {
    await syncStore.enqueueCommand({
      action: "update",
      entityType,
      entityId: ref.entityId,
      baseVersion: ref.version,
      patch: data,
    });
    return;
  }
  const merged = await syncStore.mergeIntoPendingCreate(entityType, localId, data);
  if (merged) {
    return;
  }
  await syncCreate(entityType, localId, data);
}

/** `user_settings` singleton update — no entity id/version to resolve. */
export async function syncSettingsUpdate(patch: {
  currency?: string;
  locale?: string | null;
  theme?: string | null;
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

export type CategoryKind = "income" | "expense" | "investment";

/** Stable correlation id for a legacy category name — see the module doc comment. */
export function categoryLocalId(kind: CategoryKind, name: string): string {
  return `${kind}:${name}`;
}

/**
 * Resolves (lazily create-syncing if necessary) the server `category` row
 * id for a legacy category *name* + kind. Returns `null` when the category
 * hasn't synced yet (freshly referenced in this same batch, or offline) —
 * see the module doc comment's "known leftovers" for how required-field
 * callers (`budgetEntry`) must handle that.
 */
export async function resolveCategoryId(kind: CategoryKind, name: string): Promise<string | null> {
  if (!isSyncV2Enabled()) {
    return null;
  }
  const localId = categoryLocalId(kind, name);
  const resolved = await resolveEntityId("category", localId);
  if (resolved) {
    return resolved;
  }
  await syncUpsert("category", localId, { name, kind });
  return null;
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
 * `buildData` may return `null` to skip an item (used when a required
 * cross-entity reference — e.g. a pending movement's parent recurring rule
 * — hasn't synced yet) and otherwise must return plain JSON-serializable
 * data matching `entityCreateSchemas`/`entityUpdateSchemas` for
 * `entityType`.
 */
export async function syncListDiff<T extends { id: string }>(
  entityType: SyncEntityType,
  before: readonly T[],
  after: readonly T[],
  buildData: (item: T) => Promise<JsonRecord | null> | JsonRecord | null,
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
    const data = await buildData(item);
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
