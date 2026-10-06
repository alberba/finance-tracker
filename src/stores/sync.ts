import { defineStore, getActivePinia } from 'pinia'
import { onScopeDispose, shallowRef } from 'vue'

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
  saveReadModel,
  setCachedSettings,
  type CachedEntity,
} from '../lib/client/idb-cache'
import { applyRemoteChanges, type RemoteChange } from '../lib/client/sync-read-model'
import { watchSyncConnection, withSyncLock } from '../lib/client/sync-connection'
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
import { type CommandStatus, type SyncEntityType } from '../lib/server/sync/command-schemas'

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
export const useSyncStore = defineStore('sync', () => {
  const enabled = isSyncV2Enabled()
  // Late async renders must reach this store's own Pinia, not whichever is active by then.
  const ownPinia = getActivePinia()
  const { showToast } = useToast()

  const userId = shallowRef<string | null>(null)
  const email = shallowRef<string | null>(null)
  const isLegacyOwner = shallowRef(false)
  const connection = shallowRef<ConnectionState>(
    typeof navigator === 'undefined' || navigator.onLine ? 'online' : 'offline',
  )
  const syncStatus = shallowRef<SyncStatus>('idle')
  /** When the server last confirmed this device holds its latest revision. */
  const lastCheckedAt = shallowRef<number | null>(null)
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
  let initializing: Promise<void> | null = null
  let synchronizing: Promise<void> | null = null
  let syncAgainRequested = false
  let readModel: SyncV2Bootstrap | null = null
  /** A fresh client re-reads the full model once; the cache only covers failures. */
  let readModelStale = false
  let stopConnection: (() => void) | null = null
  let detached = false

  function stop(): void {
    stopConnection?.()
    stopConnection = null
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
  }
  onScopeDispose(stop)

  async function renderReadModel(): Promise<void> {
    if (!readModel || detached) return
    const pending = outboxDb ? await listOutbox(outboxDb) : []
    const projected = pending.length
      ? applyPendingCommands(
          readModel,
          pending.map((entry) => entry.command),
        )
      : readModel
    useFinancialStateStore(ownPinia).reloadState(projectSyncV2State(projected))
  }

  /** An unloaded page: stops every background read, send and render of this client. */
  function detach(): void {
    detached = true
    stop()
  }

  function identityHeaders(): Record<string, string> {
    return userId.value ? { 'X-Finance-User-Id': userId.value } : {}
  }

  function rejectExpiredSession(response: Response): void {
    if (response.status === 401) {
      detach()
      throw new Error(
        'Tu sesión ha terminado. Tus cambios pendientes están guardados; vuelve a entrar con el mismo usuario.',
      )
    }
  }

  function isReady(): boolean {
    return enabled && !detached && cacheDb !== null && outboxDb !== null && userId.value !== null
  }

  /** Coalesces reconnects, remote notices and local writes into one cycle. */
  async function syncNow(options: { full?: boolean } = {}): Promise<void> {
    if (!isReady() || connection.value === 'offline') return
    if (options.full) readModelStale = true
    if (synchronizing) {
      syncAgainRequested = true
      return synchronizing
    }
    synchronizing = (async () => {
      do {
        syncAgainRequested = false
        syncStatus.value = 'syncing'
        try {
          if (!readModel || readModelStale) await bootstrapState()
          await pullChanges()
          await flush()
          if ((syncStatus.value as SyncStatus) === 'error') break
          await pullChanges()
          lastCheckedAt.value = Date.now()
          if (pendingCount.value === 0) {
            syncStatus.value = 'idle'
            lastError.value = null
          }
        } catch (error) {
          lastError.value =
            error instanceof Error ? error.message : 'No se pudieron descargar tus cambios.'
          syncStatus.value = 'error'
          if (!readModel) useFinancialStateStore(ownPinia).failLoad(lastError.value)
          scheduleRetry()
          break
        }
      } while (syncAgainRequested && connection.value === 'online')
    })()
    try {
      await synchronizing
    } finally {
      synchronizing = null
    }
  }

  function handleConnectionChange(next: ConnectionState): void {
    connection.value = next
    if (next === 'online') void syncNow()
  }

  /** Shares initialization so the shell cannot race the workspace. */
  async function init(nextUserId: string, options: { email?: string | null } = {}): Promise<void> {
    if (!enabled || isReadOnlyDemoActive()) return
    if (userId.value === nextUserId && initializing) return initializing
    if (initialized && userId.value === nextUserId) return
    stop()
    cacheDb?.close()
    outboxDb?.close()
    readModel = null
    initialized = false
    userId.value = nextUserId
    email.value = options.email ?? null
    initializing = (async () => {
      cacheDb = await openIdbCache(nextUserId)
      outboxDb = await openOutbox(nextUserId)
      readModel = await getCachedBootstrap<SyncV2Bootstrap>(cacheDb)
      revision.value = readModel?.revision ?? (await getCachedRevision(cacheDb))
      pendingCount.value = await countOutbox(outboxDb)
      await renderReadModel()
      await syncNow({ full: true })
      initialized = true
      stopConnection = watchSyncConnection({
        changed: () => {
          void syncNow()
        },
        online: () => handleConnectionChange('online'),
        offline: () => handleConnectionChange('offline'),
      })
    })()
    try {
      await initializing
    } finally {
      initializing = null
    }
  }

  function bootstrapState(): Promise<void> {
    return userId.value ? withSyncLock(userId.value, bootstrapUnlocked) : Promise.resolve()
  }

  async function bootstrapUnlocked(): Promise<void> {
    if (!cacheDb) return
    const loadingUserId = userId.value
    const loadingCacheDb = cacheDb
    const response = await fetch('/api/bootstrap', { headers: identityHeaders() })
    if (userId.value !== loadingUserId || cacheDb !== loadingCacheDb) return
    rejectExpiredSession(response)
    if (!response.ok)
      throw new Error(`No se pudieron cargar tus datos (${response.status}). Reintentando…`)
    const bootstrap = (await response.json()) as SyncV2Bootstrap
    readModel = await saveReadModel(cacheDb, bootstrap)
    readModelStale = false
    revision.value = readModel.revision
    await renderReadModel()
    const recoveredSubscriptionIds = bootstrap.subscriptions
      .filter((subscription) => !subscription.startDate || !subscription.nextChargeDate)
      .map((subscription) => String(subscription.legacyId || subscription.id))
    if (bootstrap.subscriptions.length) {
      const { useMovementsStore } = await import('./movements')
      await useMovementsStore(ownPinia).refreshSubscriptions(recoveredSubscriptionIds)
    }
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
    const message =
      error instanceof InvalidCommandError
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
    void syncNow()
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
      void syncNow()
    }, delay)
  }

  /** Applies one command's returned entity back into the local cache. */
  function confirmedChange(command: OutboxEntry['command'], entity: unknown): RemoteChange | null {
    if (command.action === 'settingsUpdate') {
      return entity && typeof entity === 'object'
        ? {
            entityType: 'userSettings',
            entityId: '',
            changeType: 'update',
            payload: JSON.stringify(entity),
          }
        : null
    }
    if (command.action === 'remove') {
      return {
        entityType: command.entityType,
        entityId: command.entityId,
        changeType: 'remove',
        payload: null,
      }
    }
    if (
      (command.action === 'create' || command.action === 'update') &&
      entity &&
      typeof entity === 'object'
    ) {
      const id = (entity as { id?: unknown }).id
      if (typeof id !== 'string') return null
      return {
        entityType: command.entityType,
        entityId: id,
        changeType: 'update',
        payload: JSON.stringify(entity),
      }
    }
    return null
  }

  async function absorbConfirmed(changes: RemoteChange[]): Promise<void> {
    if (!readModel || !cacheDb || changes.length === 0) return
    try {
      readModel = await saveReadModel(
        cacheDb,
        applyRemoteChanges(readModel, changes, readModel.revision),
      )
    } catch (error) {
      // The next pull brings the same rows; until then a full read is the safe fallback.
      console.warn('[sync] No se pudo incorporar un cambio confirmado', error)
      readModelStale = true
    }
  }

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
    flushing = true
    try {
      await withSyncLock(userId.value!, sendBatch)
    } finally {
      flushing = false
      if (flushAgainRequested) {
        flushAgainRequested = false
        void flush()
      }
    }
  }

  /** Sends the outbox head; runs under the sync lock so no other client resends it. */
  async function sendBatch(): Promise<void> {
    if (!outboxDb) return
    const sendingUserId = userId.value
    const sendingOutboxDb = outboxDb
    // Once the head has failed, send it alone so a failure is charged to
    // the entry that caused it, not to whichever command led the batch.
    const [head] = await peekBatch(outboxDb, 1)
    const batch = head && head.attempts > 0 ? [head] : await peekBatch(outboxDb, 5)
    if (batch.length === 0) {
      return
    }

    if (userId.value !== sendingUserId || outboxDb !== sendingOutboxDb) return
    syncStatus.value = 'syncing'
    let reachedServer = false
    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Finance-User-Id': sendingUserId! },
        body: JSON.stringify({ commands: batch.map((entry) => entry.command) }),
      })
      if (userId.value !== sendingUserId || outboxDb !== sendingOutboxDb) return
      rejectExpiredSession(response)
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
      const confirmed: Array<RemoteChange | null> = []
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
          if (result.status === 'applied') confirmed.push(confirmedChange(command, result.entity))
          if (result.entity !== undefined && cacheDb !== null) {
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

      // The read model takes the confirmed results before the outbox lets
      // them go, so no reload (even offline) can see neither of the two.
      await absorbConfirmed(confirmed.filter((change) => change !== null))
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
      // A transient Worker failure cannot invalidate an accepted local edit.
      if (reachedServer) await recordFailure(outboxDb, batch[0].seq, message)
      scheduleRetry()
    }
  }

  /** Persists rows, projection and cursor in one IndexedDB transaction. */
  function pullChanges(): Promise<void> {
    return userId.value ? withSyncLock(userId.value, pullUnlocked) : Promise.resolve()
  }

  async function pullUnlocked(): Promise<void> {
    if (!isReady() || !cacheDb || !readModel) return
    let hasMore: boolean
    do {
      const response = await fetch(`/api/changes?since=${revision.value}`, {
        headers: identityHeaders(),
      })
      rejectExpiredSession(response)
      if (!response.ok)
        throw new Error(`No se pudieron descargar tus cambios (${response.status}).`)
      const body = (await response.json()) as {
        revision: number
        changes: RemoteChange[]
        hasMore?: boolean
        requiresBootstrap?: boolean
      }
      if (
        body.requiresBootstrap ||
        body.changes.some(
          (change) => change.entityType === 'userInstrument' || change.entityType === 'reset',
        )
      ) {
        await bootstrapUnlocked()
        return
      }
      if (!Number.isSafeInteger(body.revision) || body.revision < revision.value) {
        throw new Error('La revisión remota no es válida.')
      }
      if (body.changes.length || body.revision !== revision.value) {
        const next = applyRemoteChanges(readModel, body.changes, body.revision)
        readModel = await saveReadModel(cacheDb, next)
        revision.value = readModel.revision
        await renderReadModel()
      }
      hasMore = body.hasMore === true
    } while (hasMore)
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

  async function prepareLogout(): Promise<void> {
    await syncNow()
    if (outboxDb) pendingCount.value = await countOutbox(outboxDb)
    if (pendingCount.value > 0) {
      throw new Error(
        'No se pudieron sincronizar todos los cambios. Puedes quedarte o descartarlos y salir.',
      )
    }
  }

  /** Called only after synchronization or an explicit discard decision. */
  async function logout(options: { discardPending?: boolean } = {}): Promise<void> {
    if (!options.discardPending) await prepareLogout()
    stop()
    readModel = null
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
    lastCheckedAt,
    init,
    enqueueCommand,
    flush,
    pullChanges,
    syncNow,
    detach,
    prepareLogout,
    logout,
    getEntityRef,
    getSettingsVersion,
    findEntityRef,
    peekPendingCreateId,
    mergeIntoPendingCreate,
    cancelPendingCreate,
  }
})
