import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

import { isReadOnlyDemoActive } from '../lib/client/demo-source'
import { isSyncV2Enabled } from '../lib/client/feature-flags'
import { useToast } from '../composables/useToast'
import {
  getAllEntities,
  getCachedBootstrap,
  getCachedSettings,
  getRevision as getCachedRevision,
  openIdbCache,
  putEntities,
  replaceEntities,
  removeEntity as removeCachedEntity,
  setRevision as setCachedRevision,
  setCachedSettings,
  setCachedBootstrap,
  type CachedEntity,
} from '../lib/client/idb-cache'
import { applyPendingCommands } from '../lib/client/pending-overlay'
import { projectSyncV2State, type SyncV2Bootstrap } from '../lib/client/v2-state-projection'
import { useFinancialStateStore } from './financial-state'
import {
  acknowledge,
  amendPendingCreate,
  count as countOutbox,
  discard as discardOutboxEntry,
  enqueue,
  findPendingCreate,
  InvalidCommandError,
  listAll as listOutbox,
  openOutbox,
  peekBatch,
  recordFailure,
  type OutboxCommandInput,
  type OutboxEntry,
  type PendingCreateMatch,
} from '../lib/client/outbox'
import { wipeAllClientData } from '../lib/client/wipe'
import {
  SYNC_ENTITY_TYPES,
  type CommandStatus,
  type SyncEntityType,
} from '../lib/server/sync/command-schemas'

export type ConnectionState = 'online' | 'offline'
export type SyncStatus = 'idle' | 'syncing' | 'error'

/**
 * Shape of one entry in `POST /api/sync`'s `results` array
 * (`CommandOutcome` in `src/lib/server/sync/apply-command.ts`).
 *
 * WP10 fix: `status` previously used a client-invented vocabulary
 * (`'ok' | 'error' | 'skipped'`) that the server never actually sends —
 * `apply-command.ts`'s real `CommandStatus` is `'applied' | 'not_found' |
 * 'noop'` (plus the shared `'conflict'`, which is why conflicts alone
 * worked). Every successful command therefore fell through to the `else`
 * branch below and was recorded as a failure forever: it never got
 * acknowledged out of the outbox, and (worse) `applyResultToCache` never
 * ran, so no entity this device didn't itself just create ever gained a
 * server id/version in `cacheDb` — silently breaking every downstream
 * `getEntityRef` lookup (`command-mapping.ts`'s `syncUpdate`/`syncRemove`/
 * `resolveEntityId`) for anything but same-command-cycle self-reference.
 * `currentVersion`/`message` (present on `conflict`/`not_found`) are also
 * added here to match the real payload.
 */
interface SyncCommandResult {
  commandId: string
  status: CommandStatus
  entity?: unknown
  currentVersion?: number
  message?: string
}

const RETRY_BASE_DELAY_MS = 1000
const RETRY_MAX_DELAY_MS = 30_000
/**
 * The outbox is FIFO, so a head entry the server keeps failing on (5xx)
 * would block every later command forever (audit §2.1). After this many
 * failed sends it is discarded and surfaced via `lastError`.
 */
const MAX_SEND_ATTEMPTS = 5

export const useSyncStore = defineStore('sync', () => {
  const enabled = isSyncV2Enabled()
  const { showToast } = useToast()

  const userId = shallowRef<string | null>(null)
  const email = shallowRef<string | null>(null)
  const isLegacyOwner = shallowRef(false)
  const connection = shallowRef<ConnectionState>(
    typeof navigator === 'undefined' || navigator.onLine ? 'online' : 'offline',
  )
  const syncStatus = shallowRef<SyncStatus>('idle')
  const revision = shallowRef(0)
  const pendingCount = shallowRef(0)
  const lastError = shallowRef<string | null>(null)

  let cacheDb: IDBDatabase | null = null
  let outboxDb: IDBDatabase | null = null
  let flushing = false
  // See `flush()`'s doc comment for why this exists.
  let flushAgainRequested = false
  let retryAttempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let initialized = false

  function isReady(): boolean {
    return enabled && cacheDb !== null && outboxDb !== null && userId.value !== null
  }

  /**
   * Pulls, then flushes, tracking `syncStatus` across both — the single
   * "go online" entry point (`handleConnectionChange`, `init`).
   *
   * WP10 fix: `syncStatus` previously only ever reflected `flush()`'s own
   * push phase, and `flush()` returns immediately (without touching
   * `syncStatus` at all) when the outbox is empty — so a device with
   * nothing of its own queued (the common "second device" case) never
   * transitioned through `'syncing'`, and the UI's "Sincronizado" label
   * (`#sidebar-sync-status`) was already showing before the pull that
   * populates `cacheDb` with entities *this* device didn't itself create
   * had actually finished. Wrapping both here means "Sincronizado" is an
   * honest readiness signal for `getEntityRef`, not just "nothing queued".
   */
  async function syncNow(): Promise<void> {
    syncStatus.value = 'syncing'
    try {
      await pullChanges()
      await flush()
      if (pendingCount.value === 0) await bootstrapState()
    } finally {
      if (syncStatus.value === 'syncing') {
        syncStatus.value = 'idle'
      }
    }
  }

  function handleConnectionChange(next: ConnectionState): void {
    connection.value = next
    if (next === 'online') {
      retryAttempt = 0
      // Pull first: this device's local cache may be missing (or stale on)
      // entities another device created/edited while this one was offline —
      // `getEntityRef` (used by `syncUpdate`/`syncRemove` to resolve a local
      // id to `{entityId, version}`) only ever sees what's in `cacheDb`, so
      // without this an edit to an entity this device never itself wrote
      // silently no-ops (console warning, no conflict) instead of sending a
      // stale `baseVersion` the server can reject as a genuine conflict.
      void syncNow()
    }
  }

  /** Bootstraps the local databases for the authenticated identity. Idempotent. */
  async function init(nextUserId: string, options: { email?: string | null } = {}): Promise<void> {
    if (!enabled || isReadOnlyDemoActive()) {
      // Read-only demo never opens a per-user cache/outbox or talks to the
      // server — `getGlobalDemoState()` is the only data source in that mode.
      return
    }
    if (initialized && userId.value === nextUserId) return
    if (initialized) {
      cacheDb?.close()
      outboxDb?.close()
      cacheDb = null
      outboxDb = null
      initialized = false
    }
    initialized = true
    userId.value = nextUserId
    email.value = options.email ?? null

    cacheDb = await openIdbCache(nextUserId)
    outboxDb = await openOutbox(nextUserId)
    await bootstrapState()
    revision.value = await getCachedRevision(cacheDb)
    pendingCount.value = await countOutbox(outboxDb)

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => handleConnectionChange('online'))
      window.addEventListener('offline', () => handleConnectionChange('offline'))
    }

    if (connection.value === 'online') {
      // See the identical comment in `handleConnectionChange`: pull before
      // flushing so `getEntityRef` can resolve entities this device didn't
      // itself create (e.g. a fresh "second device" for an existing user).
      await syncNow()
    }
  }

  async function bootstrapState(): Promise<void> {
    if (!cacheDb) return
    let bootstrap: SyncV2Bootstrap | null = null
    let reachedServer = false
    try {
      const response = await fetch('/api/bootstrap')
      reachedServer = response.ok
      if (response.ok) bootstrap = await response.json() as SyncV2Bootstrap
    } catch {
      // Offline reload falls back to the last complete identity-partitioned read model.
    }
    bootstrap ??= await getCachedBootstrap<SyncV2Bootstrap>(cacheDb)
    if (!bootstrap && !reachedServer) {
      // Audit §5.2: only the server can tell us this identity has no data yet.
      // When the request itself failed we know nothing, so we must not write
      // an empty read model over the cache or reset the cursor to 0 — doing so
      // makes every later edit look like a brand-new entity and duplicates it.
      lastError.value = 'No se pudo cargar tus datos. Reintentando…'
      syncStatus.value = 'error'
      return
    }
    // A brand-new identity has no read model yet. Start from an empty
    // projection; the first command will create its server-side entities.
    // Existing identities still hydrate from the network/cache above.
    bootstrap ??= {
      revision: 0,
      settings: null,
      accounts: [], categories: [], transactions: [], subscriptions: [],
      recurringRules: [], pendingMovements: [], budgetEntries: [], goals: [],
      contributions: [], userInstruments: [], wealthSnapshots: [],
      stockeventsSymbolMappings: [], stockeventsCashMappings: [], stockeventsCashSyncEntries: [],
    }
    const collections = {
      account: bootstrap.accounts,
      category: bootstrap.categories,
      transaction: bootstrap.transactions,
      subscription: bootstrap.subscriptions,
      recurringRule: bootstrap.recurringRules,
      pendingMovement: bootstrap.pendingMovements,
      budgetEntry: bootstrap.budgetEntries,
      goal: bootstrap.goals,
      contribution: bootstrap.contributions,
      userInstrument: bootstrap.userInstruments,
      wealthSnapshot: bootstrap.wealthSnapshots,
      stockeventsMapping: bootstrap.stockeventsSymbolMappings ?? [],
      stockeventsCashEntry: bootstrap.stockeventsCashSyncEntries ?? [],
    } satisfies Record<SyncEntityType, CachedEntity[]>
    if (reachedServer) {
      // Only a payload that actually came from the server may replace the
      // cache. Rewriting it from its own (possibly stale) copy would drop
      // rows this device has since learned about through `pullChanges`, with
      // the same duplicate-`create` consequence as §5.2's empty fallback.
      await Promise.all(Object.entries(collections).map(([entityType, entities]) =>
        replaceEntities(cacheDb!, entityType as SyncEntityType, entities),
      ))
      await setCachedSettings(cacheDb, bootstrap.settings)
      await setCachedBootstrap(cacheDb, bootstrap)
      await setCachedRevision(cacheDb, bootstrap.revision)
    }
    // Audit §5.4: what is still queued is shown as if it had already been
    // saved — because for the user it has been.
    const pending = outboxDb ? await listOutbox(outboxDb) : []
    const withPending = pending.length
      ? applyPendingCommands(bootstrap, pending.map((entry) => entry.command))
      : bootstrap
    useFinancialStateStore().reloadState(projectSyncV2State(withPending))
  }

  /**
   * Surfaces a command that failed to encolar (an invalid payload rejected
   * by `enqueue`/`amendPendingCreate`'s per-entity validation, or any other
   * write failure) the same visible way an already-queued command the
   * server rejects is (`lastError`/`showToast`) — never left to reject a
   * caller's promise. Every domain-store call site fires the command-mapping
   * functions fire-and-forget (`void syncListDiff(...)`, `void
   * syncUpsert(...)`, …), so an unhandled rejection here would reach the
   * user as nothing at all (audit's transversal guardrail, issue #138).
   */
  function surfaceEnqueueError(error: unknown): void {
    const message = error instanceof InvalidCommandError
      ? error.message
      : error instanceof Error
        ? `No se pudo encolar el cambio: ${error.message}`
        : 'No se pudo encolar el cambio.'
    lastError.value = message
    syncStatus.value = 'error'
    showToast(`⚠️ ${message}`)
  }

  /** Validates and appends a command to the cola de comandos, then attempts an immediate flush. */
  async function enqueueCommand(command: OutboxCommandInput): Promise<OutboxEntry | null> {
    if (isReadOnlyDemoActive()) {
      // Demo mutations stay in its isolated local cache and never enter the
      // per-user outbox or reach D1.
      return null
    }
    if (!isReady() || !outboxDb) {
      return null
    }
    let entry: OutboxEntry
    try {
      entry = await enqueue(outboxDb, command)
    } catch (error) {
      surfaceEnqueueError(error)
      return null
    }
    pendingCount.value = await countOutbox(outboxDb)
    void flush()
    return entry
  }

  function scheduleRetry(): void {
    if (retryTimer) {
      return
    }
    const delay = Math.min(RETRY_BASE_DELAY_MS * 2 ** retryAttempt, RETRY_MAX_DELAY_MS)
    retryAttempt += 1
    retryTimer = setTimeout(() => {
      retryTimer = null
      void flush()
    }, delay)
  }

  /** Applies one command's returned entity back into the local cache. */
  async function applyResultToCache(entityType: SyncEntityType, entity: unknown): Promise<void> {
    if (!cacheDb || entity === null || typeof entity !== 'object') {
      return
    }
    await putEntities(cacheDb, entityType, [entity as CachedEntity])
  }

  /**
   * Pops up to 5 outbox entries and POSTs them to `/api/sync` (WP4's batch
   * cap).
   *
   * WP10 fix: a caller that arrives while a flush is already in-flight
   * (`flushing` true — every mutation's `enqueueCommand` fires its own
   * `void flush()`, so this is the common case, not an edge case) used to
   * just no-op and be forgotten, with no `flushAgainRequested`-style
   * follow-up. The *one* place that tried to compensate was this
   * function's own tail continuation (`if (... || countOutbox > 0) { void
   * flush() }`) — but that ran *before* the `finally` block below reset
   * `flushing`, so that recursive call always hit the same `flushing`
   * guard and no-opped too. Net effect: an entity enqueued while another
   * command's flush was in flight (e.g. a `create` built while a sibling
   * `create` — its own required-FK dependency, resolved moments earlier in
   * the same build chain — was still round-tripping) could sit in the
   * outbox indefinitely, picked up only by some unrelated later trigger
   * (another mutation, a reconnect) rather than promptly. Now: a `flush()`
   * call that arrives mid-flight sets a flag instead of silently
   * vanishing, and the `finally` block (after `flushing` is actually back
   * to `false`) honors it with one more real attempt.
   */
  async function flush(): Promise<void> {
    if (!isReady() || !outboxDb) {
      return
    }
    if (flushing) {
      flushAgainRequested = true
      return
    }
    if (connection.value === 'offline') {
      return
    }
    // Once the head has failed, send it alone so a failure is charged to
    // the entry that caused it, not to whichever command led the batch.
    const [head] = await peekBatch(outboxDb, 1)
    const batch = head && head.attempts > 0 ? [head] : await peekBatch(outboxDb, 5)
    if (batch.length === 0) {
      return
    }

    flushing = true
    syncStatus.value = 'syncing'
    let reachedServer = false
    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands: batch.map((entry) => entry.command) }),
      })
      reachedServer = true

      if (!response.ok && response.status !== 409) {
        throw new Error(`El servidor respondió ${response.status}`)
      }

      const body = (await response.json()) as {
        results: SyncCommandResult[]
        revision: number
        halted: boolean
      }
      const acked: number[] = []
      // ADR 0003: a same-user conflict is never worth a modal — it is
      // reapplied over the server's current version and the queue keeps
      // moving, instead of parking the command and freezing everything
      // behind it (audit §2.4).
      const retries: OutboxCommandInput[] = []
      let lastDropMessage: string | null = null
      // Another request still holds this command's reservation; the server
      // halted the batch there, so the entry stays queued and is resent
      // after a backoff instead of immediately.
      let resendAfterBackoff = false
      for (const [index, result] of body.results.entries()) {
        const entry = batch[index]
        if (!entry) {
          continue
        }
        if (result.status === 'in_progress') {
          resendAfterBackoff = true
          break
        }
        if (result.status === 'applied' || result.status === 'noop') {
          acked.push(entry.seq)
          const command = entry.command
          if (
            result.entity !== undefined &&
            cacheDb !== null
          ) {
            if (command.action === 'settingsUpdate') {
              // Keeps this device's `user_settings.version` current, so the next
              // settings command sends the right `baseVersion` (audit §6.4).
              // `pullChanges` deliberately skips `userSettings` (it has no
              // object store), so nothing else refreshes it.
              await setCachedSettings(cacheDb, result.entity)
            } else if (command.action === 'create' || command.action === 'update') {
              await applyResultToCache(command.entityType, result.entity)
            }
          }
        } else if (result.status === 'conflict') {
          const command = entry.command
          if (command.action === 'update' || command.action === 'remove') {
            acked.push(entry.seq)
            const baseVersion = result.currentVersion ?? command.baseVersion
            retries.push(
              command.action === 'update'
                ? {
                    action: 'update',
                    entityType: command.entityType,
                    entityId: command.entityId,
                    baseVersion,
                    patch: command.patch,
                  }
                : {
                    action: 'remove',
                    entityType: command.entityType,
                    entityId: command.entityId,
                    baseVersion,
                },
            )
          } else if (command.action === 'settingsUpdate') {
            // ADR 0003 for the settings singleton: rebase over the server's
            // version instead of leaving the entry queued, where a stale
            // `baseVersion` would conflict forever.
            acked.push(entry.seq)
            retries.push({
              action: 'settingsUpdate',
              baseVersion: result.currentVersion ?? command.baseVersion,
              patch: command.patch,
            })
          }
        } else {
          // `not_found` (entity removed elsewhere) and `rejected` (invalid
          // payload, dangling reference, entity in use) can never succeed on
          // retry, so acknowledge them out of the outbox — surfaced via
          // `lastError` rather than silently dropped.
          acked.push(entry.seq)
          lastDropMessage = result.message ?? `No se pudo aplicar un cambio (${result.status}).`
        }
      }

      await acknowledge(outboxDb, acked)
      pendingCount.value = await countOutbox(outboxDb)
      // The cursor deliberately does NOT move here (audit §5.3). `body.revision`
      // is the user's *global* revision after this batch, which includes changes
      // other devices made and this one has never applied — adopting it would
      // put them below the cursor and they would never be pulled again. Only
      // `pullChanges`, which actually applies changes, may advance it.

      lastError.value = lastDropMessage
      syncStatus.value = lastDropMessage ? 'error' : 'idle'

      for (const retry of retries) {
        await enqueueCommand(retry)
      }
      // The discreet conflict notice goes first: if the same batch also had
      // a hard failure, that more actionable message is the one left on
      // screen — `showToast` is a single shared banner (`useToast.ts`), so
      // whichever call lands last wins the visible text.
      if (retries.length > 0) {
        showToast('Un cambio tuyo se reaplicó sobre la versión más reciente del servidor.')
      }
      if (lastDropMessage) {
        showToast(`⚠️ No se pudo guardar este cambio: ${lastDropMessage}`)
      }

      if (resendAfterBackoff) {
        scheduleRetry()
      } else {
        retryAttempt = 0
        if (body.halted || (await countOutbox(outboxDb)) > 0) {
          flushAgainRequested = true
        }
      }
    } catch (error) {
      syncStatus.value = 'error'
      const message = error instanceof Error ? error.message : 'Error de sincronización'
      lastError.value = message
      // Network failures never count: a flaky connection must not discard
      // edits the server has never seen.
      const failed = batch[0]
      if (reachedServer && failed.attempts + 1 >= MAX_SEND_ATTEMPTS) {
        await discardOutboxEntry(outboxDb, failed.seq)
        pendingCount.value = await countOutbox(outboxDb)
        lastError.value = `Se descartó un cambio que el servidor no pudo aplicar tras ${MAX_SEND_ATTEMPTS} intentos: ${message}`
        showToast(`⚠️ ${lastError.value}`)
      } else if (reachedServer) {
        await recordFailure(outboxDb, failed.seq, message)
      }
      scheduleRetry()
    } finally {
      flushing = false
      if (flushAgainRequested) {
        flushAgainRequested = false
        void flush()
      }
    }
  }

  /** Pulls incremental changes since the last known revision (`GET /api/changes`). */
  /**
   * Shape of one `GET /api/changes` row — `SyncChangeRow`
   * (`src/db/repositories/sync.ts`), returned as-is by the route.
   *
   * WP10 fix: previously typed (and read) as `{ entityType, entityId,
   * data, removed }`, none of which exist on the real row: the entity
   * snapshot is `payload`, a JSON *string* (D1 has no native JSON column),
   * not a `data` object; "this row is a delete" is `changeType ===
   * 'remove'`, not a `removed` boolean. Both mismatches meant every pulled
   * change was silently a no-op — `applyResultToCache` bailed on
   * `change.data` always being `undefined` (`typeof undefined !==
   * 'object'`), so `cacheDb` never actually gained any entity a device
   * didn't create itself, and `removeEntity` was never called either. The
   * pull's `revision` bookkeeping still advanced, so this failed silently
   * with no retry: a device could poll forever and never notice its cache
   * was empty of everyone else's writes.
   */
  interface SyncChangeRow {
    entityType: SyncEntityType
    entityId: string
    changeType: 'create' | 'update' | 'remove'
    payload: string
  }

  async function pullChanges(): Promise<void> {
    if (!isReady() || !cacheDb) {
      return
    }
    let response: Response
    try {
      response = await fetch(`/api/changes?since=${revision.value}`)
    } catch {
      // Same principle as `bootstrapState`'s §5.2 fix: a network failure here
      // must leave the cursor and cache untouched, not be treated as "nothing
      // changed" and definitely not thrown — a reload while offline still
      // needs `init()` to finish so the pending-overlay in `bootstrapState`
      // can render what the user queued (audit §5.4).
      return
    }
    if (!response.ok) {
      return
    }
    const body = (await response.json()) as {
      revision: number
      changes: SyncChangeRow[]
    }
    for (const change of body.changes) {
      // The change log also carries non-entity rows (`userSettings`) that
      // have no object store; applying them used to throw and pin the
      // cursor forever (audit §2.5). Bootstrap rehydrates settings.
      if (!(SYNC_ENTITY_TYPES as readonly string[]).includes(change.entityType)) continue
      try {
        if (change.changeType === 'remove') {
          await removeCachedEntity(cacheDb, change.entityType, change.entityId)
        } else {
          await applyResultToCache(change.entityType, JSON.parse(change.payload))
        }
      } catch (error) {
        console.warn('[sync] No se pudo aplicar un cambio remoto', change.entityType, change.entityId, error)
      }
    }
    revision.value = body.revision
    await setCachedRevision(cacheDb, body.revision)
  }

  /**
   * The `user_settings.version` this device last saw (audit §6.4).
   * `syncSettingsUpdate` sends it as the command's `baseVersion`, so a
   * settings write from a device that is behind becomes a conflict the queue
   * rebases, instead of silently overwriting another device's currency or
   * theme. `null` before this device has ever seen the row, which the server
   * reads as "create it".
   */
  async function getSettingsVersion(): Promise<number | null> {
    if (!isReady() || !cacheDb) {
      return null
    }
    const settings = await getCachedSettings<{ version?: unknown } | null>(cacheDb)
    const version = settings?.version
    return typeof version === 'number' ? version : null
  }

  /**
   * Resolves a locally-known entity to its `{entityId, version}` by scanning
   * the local IndexedDB cache (populated by bootstrap/pull and by prior
   * successful `create`/`update` sync results — see `applyResultToCache`).
   *
   * The entity's own id is tried first: an entity created from now on carries
   * the identity the client minted for it (ADR 0001) as its primary key in
   * D1 too, so the local id *is* the server id and no correlation is needed.
   * Only when no row carries that id does the `legacyId` column come into
   * play — the one remaining use of the identifier derived from v1's data,
   * kept so a row migrated from v1 stays addressable by the id the local
   * `State` still knows it by.
   *
   * Returns `null` when sync-v2 isn't ready or the entity hasn't
   * synced/been created server-side yet — `src/lib/client/command-mapping.ts`
   * (WP7b) falls back to `mergeIntoPendingCreate`/`cancelPendingCreate` in
   * that case.
   */
  async function getEntityRef(
    entityType: SyncEntityType,
    localId: string,
  ): Promise<{ entityId: string; version: number } | null> {
    if (!isReady() || !cacheDb) {
      return null
    }
    const entities = await getAllEntities(cacheDb, entityType)
    const match =
      entities.find((entity) => entity.id === localId) ??
      entities.find((entity) => (entity as { legacyId?: unknown }).legacyId === localId)
    if (!match) {
      return null
    }
    const rawVersion = (match as { version?: unknown }).version
    const version = typeof rawVersion === 'number' ? rawVersion : 0
    return { entityId: match.id, version }
  }

  /**
   * Resolves an entity by a predicate over its cached row instead of by id
   * — for aggregates whose identity is a real natural key (a category's
   * name+kind, a budget cell's `(categoryId, year, month)`, a snapshot's
   * `(year, month)`). Matching on the row's own columns is a query, not a
   * derived correlation id (ADR 0001).
   */
  async function findEntityRef(
    entityType: SyncEntityType,
    matches: (entity: Record<string, unknown>) => boolean,
  ): Promise<{ entityId: string; version: number } | null> {
    if (!isReady() || !cacheDb) {
      return null
    }
    const entities = await getAllEntities(cacheDb, entityType)
    const match = entities.find((entity) => matches(entity as Record<string, unknown>))
    if (!match) {
      return null
    }
    const rawVersion = (match as { version?: unknown }).version
    const version = typeof rawVersion === 'number' ? rawVersion : 0
    return { entityId: match.id, version }
  }

  /**
   * Reads the client-minted id (ADR 0001) off a still-queued, not-yet-
   * acknowledged `create` command matching `matches`, without amending or
   * removing it. Used by callers that need to *reference* the entity (as a
   * foreign key on another command in the same batch) before its own create
   * has been acknowledged — e.g. a budget entry pointing at a category
   * that hasn't synced yet. `null` if nothing is pending or the pending
   * create wasn't minted with an id.
   */
  async function peekPendingCreateId(
    entityType: SyncEntityType,
    matches: PendingCreateMatch,
  ): Promise<string | null> {
    if (!outboxDb) {
      return null
    }
    const pending = await findPendingCreate(outboxDb, entityType, matches)
    if (!pending || pending.command.action !== 'create') {
      return null
    }
    const id = (pending.command.data as { id?: unknown }).id
    return typeof id === 'string' ? id : null
  }

  /**
   * Folds a patch into a still-queued, not-yet-acknowledged `create`
   * command matching `matches` — used when the user edits an entity before
   * its `create` command has synced (so there is no server id to address
   * an `update` command to yet). Returns whether a pending create was
   * found.
   *
   * `amendPendingCreate` validates the merged payload per entity (issue
   * #138) and leaves the still-queued create untouched if it doesn't match
   * — surfaced the same visible way `enqueueCommand` surfaces a bad command,
   * never thrown. A pending create counts as "found" either way: returning
   * `false` here would make `syncUpsert`'s caller fall through to
   * `syncCreate` and enqueue a *second*, duplicate create for the same
   * entity.
   */
  async function mergeIntoPendingCreate(
    entityType: SyncEntityType,
    matches: PendingCreateMatch,
    patch: Record<string, unknown>,
  ): Promise<boolean> {
    if (!outboxDb) {
      return false
    }
    const pending = await findPendingCreate(outboxDb, entityType, matches)
    if (!pending) {
      return false
    }
    try {
      await amendPendingCreate(outboxDb, pending.seq, patch)
    } catch (error) {
      surfaceEnqueueError(error)
    }
    return true
  }

  /**
   * Cancels a still-queued, not-yet-acknowledged `create` command matching
   * `matches` — used when the user deletes an entity before its `create`
   * command has synced. Returns whether a pending create was found.
   */
  async function cancelPendingCreate(
    entityType: SyncEntityType,
    matches: PendingCreateMatch,
  ): Promise<boolean> {
    if (!outboxDb) {
      return false
    }
    const pending = await findPendingCreate(outboxDb, entityType, matches)
    if (!pending) {
      return false
    }
    await discardOutboxEntry(outboxDb, pending.seq)
    pendingCount.value = await countOutbox(outboxDb)
    return true
  }

  /** Full local wipe (Cf-Access logout doesn't clear client storage on its own). */
  async function logout(): Promise<void> {
    cacheDb?.close()
    outboxDb?.close()
    cacheDb = null
    outboxDb = null
    if (userId.value) {
      await wipeAllClientData(userId.value)
    }
    initialized = false
    userId.value = null
    email.value = null
    revision.value = 0
    pendingCount.value = 0
    syncStatus.value = 'idle'
  }

  return {
    enabled,
    userId,
    email,
    isLegacyOwner,
    connection,
    syncStatus,
    revision,
    pendingCount,
    lastError,
    init,
    enqueueCommand,
    flush,
    pullChanges,
    logout,
    getEntityRef,
    getSettingsVersion,
    findEntityRef,
    peekPendingCreateId,
    mergeIntoPendingCreate,
    cancelPendingCreate,
  }
})
