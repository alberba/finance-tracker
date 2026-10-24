import { Data, Effect } from 'effect'
import { defineStore, getActivePinia } from 'pinia'
import { onScopeDispose, shallowRef } from 'vue'

import { isReadOnlyDemoActive } from '../lib/client/demo-source'
import { useToast } from '../composables/useToast'
import {
  acknowledge,
  count as countOutbox,
  discard as discardOutboxEntry,
  enqueue,
  findPendingCreate,
  InvalidCommandError,
  listAll as listOutbox,
  peekBatch,
  recordFailure,
  amendPendingCreate,
  type OutboxCommandInput,
  type OutboxEntry,
  type PendingCreateMatch,
} from '../lib/client/outbox'
import {
  getCachedBootstrap,
  getCachedSettings,
  getAllEntities,
  getRevision as getCachedRevision,
  putEntities,
  saveReadModel,
  setCachedSettings,
  type CachedEntity,
} from '../lib/client/idb-cache'
import {
  readJson,
  sendRequest,
  ClientJsonError,
  type ClientHttp,
  type ClientNetworkError,
} from '../lib/client/http'
import { createClientRuntime, type ClientRuntime } from '../lib/client/runtime'
import { ClientStorage, type ClientStorageError } from '../lib/client/storage'
import { applyRemoteChanges, type RemoteChange } from '../lib/client/sync-read-model'
import { watchSyncConnection, withSyncLock } from '../lib/client/sync-connection'
import { applyPendingCommands } from '../lib/client/pending-overlay'
import { projectSyncV2State, type SyncV2Bootstrap } from '../lib/client/v2-state-projection'
import { wipeAllClientData } from '../lib/client/wipe'
import { quoteSourceKey } from '../domain/investment/symbol-matching'
import { useFinancialStateStore } from './financial-state'
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

/** A sync step that could not name a storage or transport error of its own. */
export class SyncError extends Data.TaggedError('SyncError')<{ readonly message: string }> {}

/** Everything the sync engine needs, provided by the per-user client runtime. */
type ClientServices = ClientHttp | ClientStorage
type SyncEffect<A, E = never> = Effect.Effect<A, E, ClientServices>

/** Errors any sync step can surface; every one of them is already a message for the UI. */
type SyncFailure = SyncError | ClientStorageError | ClientNetworkError | ClientJsonError

const RETRY_BASE_DELAY_MS = 1000
const RETRY_MAX_DELAY_MS = 30_000

export const useSyncStore = defineStore('sync', () => {
  // Late async renders must reach this store's own Pinia, not whichever is active by then.
  const ownPinia = getActivePinia()
  const { showToast } = useToast()

  const userId = shallowRef<string | null>(null)
  const email = shallowRef<string | null>(null)
  const connection = shallowRef<ConnectionState>(
    typeof navigator === 'undefined' || navigator.onLine ? 'online' : 'offline',
  )
  const syncStatus = shallowRef<SyncStatus>('idle')
  /** When the server last confirmed this device holds its latest revision. */
  const lastCheckedAt = shallowRef<number | null>(null)
  const revision = shallowRef(0)
  const pendingCount = shallowRef(0)
  const lastError = shallowRef<string | null>(null)

  /**
   * The client runtime owns the IndexedDB handles (ADR-0006). Created on
   * `init` for the signed-in user and disposed on logout.
   */
  let runtime: ClientRuntime | null = null
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

  function isReady(): boolean {
    return !detached && runtime !== null && userId.value !== null
  }

  /**
   * Runs one internal effect at this store's edge (a Pinia action). The
   * runtime is captured once so a logout during an in-flight step rejects
   * instead of running against a disposed storage layer.
   */
  function run<A, E>(effect: SyncEffect<A, E>): Promise<A> {
    const active = runtime
    if (!active) {
      return Promise.reject(new SyncError({ message: 'La sincronización no está iniciada.' }))
    }
    return active.run(effect)
  }

  function identityHeaders(): Record<string, string> {
    return userId.value ? { 'X-Finance-User-Id': userId.value } : {}
  }

  function failSync(message: string): Effect.Effect<never, SyncError> {
    return Effect.fail(new SyncError({ message }))
  }

  function rejectExpiredSession(response: Response): Effect.Effect<void, SyncError> {
    if (response.status !== 401) return Effect.void
    detach()
    return failSync(
      'Tu sesión ha terminado. Tus cambios pendientes están guardados; vuelve a entrar con el mismo usuario.',
    )
  }

  function renderReadModel(): SyncEffect<void, ClientStorageError> {
    return Effect.gen(function* () {
      if (!readModel || detached) return
      const pending = yield* listOutbox()
      const projected = pending.length
        ? applyPendingCommands(
            readModel,
            pending.map((entry) => entry.command),
          )
        : readModel
      const financialStateStore = useFinancialStateStore(ownPinia)
      const nextState = projectSyncV2State(projected, financialStateStore.year)
      // Live prices are transient; a settings acknowledgement must not erase
      // them. Carry them only while the source still identifies the same quote.
      for (const instrument of nextState.instruments) {
        const previous = financialStateStore.instruments.find((row) => row.id === instrument.id)
        if (previous && quoteSourceKey(previous) === quoteSourceKey(instrument)) {
          const quote = financialStateStore.quotes[instrument.id]
          if (quote && !nextState.quotes[instrument.id]) nextState.quotes[instrument.id] = quote
        }
      }
      financialStateStore.replaceState(nextState)
    })
  }

  /** An unloaded page: stops every background read, send and render of this client. */
  function detach(): void {
    detached = true
    stop()
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
          await run(syncCycle())
          // A rejected command leaves a visible error on this cycle; the next
          // successful one clears it instead of this same pass overwriting it.
          if ((syncStatus.value as SyncStatus) === 'error') break
          lastCheckedAt.value = Date.now()
          if (pendingCount.value === 0) {
            syncStatus.value = 'idle'
            lastError.value = null
          }
        } catch (error) {
          lastError.value = errorMessage(error, 'No se pudieron descargar tus cambios.')
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

  function syncCycle(): SyncEffect<void, SyncFailure> {
    return Effect.gen(function* () {
      if (!readModel || readModelStale) yield* bootstrapUnlocked()
      yield* pullUnlocked()
      yield* flushEffect()
      if ((syncStatus.value as SyncStatus) === 'error') return
      yield* pullUnlocked()
    })
  }

  function handleConnectionChange(next: ConnectionState): void {
    connection.value = next
    if (next === 'online') void syncNow()
  }

  /** Shares initialization so the shell cannot race the workspace. */
  async function init(nextUserId: string, options: { email?: string | null } = {}): Promise<void> {
    if (isReadOnlyDemoActive()) return
    if (userId.value === nextUserId && initializing) return initializing
    if (initialized && userId.value === nextUserId) return
    stop()
    await runtime?.dispose()
    readModel = null
    initialized = false
    detached = false
    userId.value = nextUserId
    email.value = options.email ?? null
    runtime = await createClientRuntime(nextUserId)
    initializing = (async () => {
      const cached = await run(
        Effect.gen(function* () {
          const bootstrap = yield* getCachedBootstrap<SyncV2Bootstrap>()
          const cachedRevision = yield* getCachedRevision()
          const pending = yield* countOutbox()
          return { bootstrap, cachedRevision, pending }
        }),
      )
      readModel = cached.bootstrap
      revision.value = readModel?.revision ?? cached.cachedRevision
      pendingCount.value = cached.pending
      await run(renderReadModel())
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

  function bootstrapUnlocked(): SyncEffect<void, SyncFailure> {
    return Effect.gen(function* () {
      const loadingUserId = userId.value
      const loadingRuntime = runtime
      const response = yield* sendRequest('/api/bootstrap', { headers: identityHeaders() })
      if (userId.value !== loadingUserId || runtime !== loadingRuntime) return
      yield* rejectExpiredSession(response)
      if (!response.ok) {
        return yield* failSync(
          `No se pudieron cargar tus datos (${response.status}). Reintentando…`,
        )
      }
      const bootstrap = (yield* readJson(response)) as SyncV2Bootstrap
      readModel = yield* saveReadModel(bootstrap)
      readModelStale = false
      revision.value = readModel.revision
      yield* renderReadModel()
      const recoveredSubscriptionIds = bootstrap.subscriptions
        .filter((subscription) => !subscription.startDate || !subscription.nextChargeDate)
        .map((subscription) => String(subscription.legacyId || subscription.id))
      if (bootstrap.subscriptions.length) {
        const { useMovementsStore } = yield* Effect.promise(() => import('./movements'))
        yield* Effect.promise(() =>
          useMovementsStore(ownPinia).refreshSubscriptions(recoveredSubscriptionIds),
        )
      }
    })
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

  /** Appends a command and refreshes the pending counter; never fails the caller. */
  function appendCommand(command: OutboxCommandInput): SyncEffect<OutboxEntry | null> {
    return Effect.gen(function* () {
      const entry = yield* enqueue(command).pipe(
        Effect.catchTag('InvalidCommandError', (error) =>
          Effect.sync(() => {
            surfaceEnqueueError(error)
            return null
          }),
        ),
        Effect.catchTag('ClientStorageError', (error) =>
          Effect.sync(() => {
            surfaceEnqueueError(error)
            return null
          }),
        ),
      )
      pendingCount.value = yield* countOutbox().pipe(Effect.orElseSucceed(() => pendingCount.value))
      return entry
    })
  }

  /** Validates and appends a command to the cola de comandos, then attempts an immediate flush. */
  async function enqueueCommand(command: OutboxCommandInput): Promise<OutboxEntry | null> {
    if (isReadOnlyDemoActive()) {
      // Demo mutations stay in its isolated local cache and never enter the
      // per-user outbox or reach D1.
      return null
    }
    if (!isReady()) {
      return null
    }
    const entry = await run(appendCommand(command))
    if (entry) void syncNow()
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

  function absorbConfirmed(changes: RemoteChange[]): SyncEffect<void, ClientStorageError> {
    return Effect.gen(function* () {
      if (!readModel || changes.length === 0) return
      readModel = yield* saveReadModel(applyRemoteChanges(readModel, changes, readModel.revision))
    }).pipe(
      Effect.catchTag('ClientStorageError', (error) =>
        Effect.sync(() => {
          // The next pull brings the same rows; until then a full read is the safe fallback.
          console.warn('[sync] No se pudo incorporar un cambio confirmado', error)
          readModelStale = true
        }),
      ),
    )
  }

  function applyResultToCache(
    entityType: SyncEntityType,
    entity: unknown,
  ): SyncEffect<void, ClientStorageError> {
    if (entity === null || typeof entity !== 'object') return Effect.void
    return putEntities(entityType, [entity as CachedEntity])
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
    if (!isReady()) return
    await run(flushEffect())
  }

  function flushEffect(): SyncEffect<void, SyncFailure> {
    return Effect.gen(function* () {
      if (!isReady()) return
      if (flushing) {
        flushAgainRequested = true
        return
      }
      if (connection.value === 'offline') return
      flushing = true
      yield* withSyncLock(userId.value!, sendBatch()).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            flushing = false
          }),
        ),
      )
      if (flushAgainRequested) {
        flushAgainRequested = false
        yield* flushEffect()
      }
    })
  }

  /** Sends the outbox head; runs under the sync lock so no other client resends it. */
  function sendBatch(): SyncEffect<void, SyncFailure> {
    return Effect.gen(function* () {
      const sendingUserId = userId.value
      const sendingRuntime = runtime
      // Once the head has failed, send it alone so a failure is charged to
      // the entry that caused it, not to whichever command led the batch.
      const [head] = yield* peekBatch(1)
      const batch = head && head.attempts > 0 ? [head] : yield* peekBatch(5)
      if (batch.length === 0) return

      if (userId.value !== sendingUserId || runtime !== sendingRuntime) return
      syncStatus.value = 'syncing'
      const outcome = yield* sendRequest('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Finance-User-Id': sendingUserId! },
        body: JSON.stringify({ commands: batch.map((entry) => entry.command) }),
      }).pipe(
        Effect.map((response) => ({ ok: true as const, response })),
        Effect.catchTag('ClientNetworkError', () =>
          Effect.succeed({ ok: false as const, message: 'Error de red' }),
        ),
      )
      if (!outcome.ok) {
        return yield* handleSendFailure(batch, outcome.message)
      }
      const response = outcome.response
      if (userId.value !== sendingUserId || runtime !== sendingRuntime) return
      yield* rejectExpiredSession(response)

      if (!response.ok && response.status !== 409) {
        return yield* handleSendFailure(batch, `El servidor respondió ${response.status}`, true)
      }

      const body = (yield* readJson(response).pipe(
        Effect.orElseSucceed(
          () => null as { results: SyncCommandResult[]; revision: number; halted: boolean } | null,
        ),
      )) as { results: SyncCommandResult[]; revision: number; halted: boolean } | null
      if (!body) {
        return yield* handleSendFailure(batch, 'La respuesta de sincronización no es válida.')
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
          if (result.entity !== undefined) {
            if (command.action === 'settingsUpdate') {
              // Keeps this device's `user_settings.version` current, so the next
              // settings command sends the right `baseVersion` (audit §6.4).
              // `pullChanges` deliberately skips `userSettings` (it has no
              // object store), so nothing else refreshes it.
              yield* setCachedSettings(result.entity)
            } else if (command.action === 'create' || command.action === 'update') {
              yield* applyResultToCache(command.entityType, result.entity)
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
      yield* absorbConfirmed(confirmed.filter((change) => change !== null))
      yield* acknowledge(acked)
      pendingCount.value = yield* countOutbox()
      // The cursor deliberately does NOT move here (audit §5.3). `body.revision`
      // is the user's *global* revision after this batch, which includes changes
      // other devices made and this one has never applied — adopting it would
      // put them below the cursor and they would never be pulled again. Only
      // `pullChanges`, which actually applies changes, may advance it.

      lastError.value = lastDropMessage
      syncStatus.value = lastDropMessage ? 'error' : 'idle'

      for (const retry of retries) {
        yield* appendCommand(retry)
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
        if (body.halted || (yield* countOutbox()) > 0) {
          flushAgainRequested = true
        }
      }
    })
  }

  /**
   * A failed send keeps the edit: the head entry records the attempt and the
   * store retries with backoff. Shared by the transport and HTTP-status paths.
   */
  function handleSendFailure(
    batch: OutboxEntry[],
    message: string,
    reachedServer = false,
  ): SyncEffect<void> {
    return Effect.gen(function* () {
      syncStatus.value = 'error'
      lastError.value = message
      // A transient Worker failure cannot invalidate an accepted local edit.
      if (reachedServer) {
        yield* recordFailure(batch[0].seq, message).pipe(Effect.orElseSucceed(() => undefined))
      }
      scheduleRetry()
    })
  }

  /** Persists rows, projection and cursor in one IndexedDB transaction. */
  function pullChanges(): Promise<void> {
    return userId.value ? run(withSyncLock(userId.value, pullUnlocked())) : Promise.resolve()
  }

  function pullUnlocked(): SyncEffect<void, SyncFailure> {
    return Effect.gen(function* () {
      if (!isReady() || !readModel) return
      let hasMore: boolean
      do {
        const response = yield* sendRequest(`/api/changes?since=${revision.value}`, {
          headers: identityHeaders(),
        })
        yield* rejectExpiredSession(response)
        if (!response.ok) {
          return yield* failSync(`No se pudieron descargar tus cambios (${response.status}).`)
        }
        const body = (yield* readJson(response)) as {
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
          yield* bootstrapUnlocked()
          return
        }
        if (!Number.isSafeInteger(body.revision) || body.revision < revision.value) {
          return yield* failSync('La revisión remota no es válida.')
        }
        if (body.changes.length || body.revision !== revision.value) {
          const next = applyRemoteChanges(readModel, body.changes, body.revision)
          readModel = yield* saveReadModel(next)
          revision.value = readModel.revision
          yield* renderReadModel()
        }
        hasMore = body.hasMore === true
      } while (hasMore)
    })
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
    if (!isReady()) return null
    return run(
      Effect.gen(function* () {
        const settings = yield* getCachedSettings<{ version?: unknown } | null>()
        const version = settings?.version
        return typeof version === 'number' ? version : null
      }),
    )
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
    if (!isReady()) return null
    return run(
      Effect.gen(function* () {
        const entities = yield* getAllEntities(entityType)
        const match =
          entities.find((entity) => entity.id === localId) ??
          entities.find((entity) => (entity as { legacyId?: unknown }).legacyId === localId)
        if (!match) return null
        return { entityId: match.id, version: versionOf(match) }
      }),
    )
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
    if (!isReady()) return null
    return run(
      Effect.gen(function* () {
        const entities = yield* getAllEntities(entityType)
        const match = entities.find((entity) => matches(entity as Record<string, unknown>))
        if (!match) return null
        return { entityId: match.id, version: versionOf(match) }
      }),
    )
  }

  /** Global instruments live in the cached bootstrap, outside the per-entity sync collections. */
  async function getInstrumentId(localId: string): Promise<string | null> {
    if (!isReady()) return null
    return run(
      Effect.gen(function* () {
        const bootstrap = yield* getCachedBootstrap<SyncV2Bootstrap>()
        const configured = bootstrap?.userInstruments.find(
          (row) => row.id === localId && row.quoteConfig,
        )
        if (configured) return String(configured.instrumentId)
        const instruments = bootstrap?.instruments ?? []
        const instrument =
          instruments.find((row) => row.id === localId) ??
          instruments.find((row) => row.legacyId === localId)
        return instrument?.id ?? null
      }),
    )
  }

  /** Resolves a legacy catalog identity to this user's tracking row. */
  async function getUserInstrumentId(localId: string): Promise<string | null> {
    if (!isReady()) return null
    return run(
      Effect.gen(function* () {
        const bootstrap = yield* getCachedBootstrap<SyncV2Bootstrap>()
        const instrument = bootstrap?.instruments?.find(
          (row) => row.id === localId || row.legacyId === localId,
        )
        return instrument?.userInstrument.id ?? null
      }),
    )
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
    if (!isReady()) return null
    return run(
      Effect.gen(function* () {
        const pending = yield* findPendingCreate(entityType, matches)
        if (!pending || pending.command.action !== 'create') return null
        const id = (pending.command.data as { id?: unknown }).id
        return typeof id === 'string' ? id : null
      }),
    )
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
    if (!isReady()) return false
    return run(
      Effect.gen(function* () {
        const pending = yield* findPendingCreate(entityType, matches)
        if (!pending) return false
        yield* amendPendingCreate(pending.seq, patch).pipe(
          Effect.catchTag('InvalidCommandError', (error) =>
            Effect.sync(() => surfaceEnqueueError(error)),
          ),
          Effect.catchTag('ClientStorageError', (error) =>
            Effect.sync(() => surfaceEnqueueError(error)),
          ),
        )
        return true
      }),
    )
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
    if (!isReady()) return false
    return run(
      Effect.gen(function* () {
        const pending = yield* findPendingCreate(entityType, matches)
        if (!pending) return false
        yield* discardOutboxEntry(pending.seq)
        pendingCount.value = yield* countOutbox()
        return true
      }),
    )
  }

  async function prepareLogout(): Promise<void> {
    await syncNow()
    if (isReady()) pendingCount.value = await run(countOutbox())
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
    const leavingUserId = userId.value
    const leavingRuntime = runtime
    runtime = null
    // Close this page's connections before deleting the databases: an open
    // connection would block the deletion.
    await leavingRuntime?.dispose()
    if (leavingUserId) {
      await Effect.runPromise(wipeAllClientData(leavingUserId))
    }
    initialized = false
    detached = false
    userId.value = null
    email.value = null
    revision.value = 0
    pendingCount.value = 0
    syncStatus.value = 'idle'
  }

  return {
    userId,
    email,
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
    /** Reloads the whole read model after a server-side write (Bitvavo import and link). */
    refreshFromServer: () => syncNow({ full: true }),
    detach,
    prepareLogout,
    logout,
    getEntityRef,
    getSettingsVersion,
    findEntityRef,
    getInstrumentId,
    getUserInstrumentId,
    peekPendingCreateId,
    mergeIntoPendingCreate,
    cancelPendingCreate,
  }
})

function versionOf(entity: CachedEntity): number {
  const raw = (entity as { version?: unknown }).version
  return typeof raw === 'number' ? raw : 0
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}
