/**
 * Persistent, ordered client outbox (WP7) mirroring `POST /api/sync`'s
 * command contract exactly — it validates every enqueued command against
 * the same `syncCommandSchema` the server uses
 * (`src/lib/server/sync/command-schemas.ts`, imported read-only), so a
 * malformed command is rejected locally instead of round-tripping to the
 * server to find out.
 *
 * One IndexedDB database per `userId`, a single `commands` object store
 * keyed by an auto-incrementing `seq` (defines FIFO replay order). Entries
 * are removed only once the server has confirmed them (`acknowledge`) —
 * the queue survives reloads/offline periods by design.
 *
 * Every operation is an `Effect` over `ClientStorage` (ADR-0006): the store
 * owns the handles, this module owns the queue, and a rejected command is a
 * typed `InvalidCommandError` instead of an untyped throw.
 */

import { Data, Effect } from 'effect'

import {
  entityCreatePayloadSchemas,
  entityUpdateSchemas,
  syncCommandSchema,
  type SyncCommandInput,
  type SyncEntityType,
} from '../server/sync/command-schemas'
import { ClientStorage, storageError, type ClientStorageError } from './storage'

const DB_VERSION = 2
const STORE = 'commands'
/**
 * Persisted publication generation per movement (#489), in the same database
 * as the queue so a command and the generation it advances commit in one
 * IndexedDB transaction — the cross-tab exclusion that a page-local lock
 * cannot provide.
 */
export const MOVEMENT_PUBLICATIONS_STORE = 'movementPublications'
export const COMMANDS_STORE = STORE

/**
 * Client-only provenance of a queued command. It never travels to the server:
 * `POST /api/sync` sends `entry.command`, not the whole entry. The queue uses
 * it to re-evaluate a link-owned command on conflict instead of rebasing a
 * stale snapshot (ADR 0003 stays untouched for every other command).
 */
export interface OutboxPublication {
  movementId: string
  origin: 'instrumentLink'
  /** Generation the command was published at. */
  generation: number
  /** Local instrument id the link targets. */
  instrumentId: string
}

export interface OutboxEntry {
  seq: number
  command: SyncCommandInput
  enqueuedAt: string
  attempts: number
  lastError?: string
  publication?: OutboxPublication
}

/**
 * `Omit<SyncCommandInput, "commandId">` on its own collapses the
 * discriminated union (built-in `Omit` isn't distributive over unions), so
 * this is written as an explicit distributive conditional type instead —
 * it preserves each of the five command shapes with `commandId` made
 * optional, which is what `enqueue`/`enqueueCommand` callers need.
 */
export type OutboxCommandInput = SyncCommandInput extends infer T
  ? T extends SyncCommandInput
    ? Omit<T, 'commandId'> & { commandId?: string }
    : never
  : never

function dbNameFor(userId: string): string {
  return `finance-tracker-outbox-v2:${userId}`
}

/** Opens (creating/upgrading if needed) the per-user outbox database. */
export const openOutbox = (userId: string): Effect.Effect<IDBDatabase, ClientStorageError> =>
  Effect.tryPromise({
    try: () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbNameFor(userId), DB_VERSION)

        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true })
          }
          // Version 2 added this store; `commands` is left untouched so a
          // queue written by an older build survives the upgrade.
          if (!db.objectStoreNames.contains(MOVEMENT_PUBLICATIONS_STORE)) {
            db.createObjectStore(MOVEMENT_PUBLICATIONS_STORE, { keyPath: 'id' })
          }
        }

        // An older tab holding a version-1 connection would otherwise make
        // this open hang forever. Fail visibly instead of silently.
        request.onblocked = () =>
          reject(
            new Error(
              'Otra pestaña mantiene abierto el almacenamiento local. Recarga o cierra las demás pestañas.',
            ),
          )
        request.onsuccess = () => {
          const db = request.result
          // Yield the connection to a newer build instead of blocking it.
          db.onversionchange = () => db.close()
          resolve(db)
        }
        request.onerror = () =>
          reject(request.error ?? new Error('No se pudo abrir el outbox IndexedDB.'))
      }),
    catch: (cause) => storageError(cause, 'No se pudo abrir el outbox IndexedDB.'),
  })

/** Resolves one IndexedDB request; shared with the movement publication transaction. */
export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Fallo en operación del outbox.'))
  })
}

/** Resolves when an IndexedDB transaction commits; shared with the movement publication transaction. */
export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Fallo en transacción del outbox.'))
    tx.onabort = () => reject(tx.error ?? new Error('Transacción del outbox abortada.'))
  })
}

function formatIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): string {
  return issues
    .map((issue) => `${issue.path.map(String).join('.') || '(raíz)'}: ${issue.message}`)
    .join('; ')
}

interface InvalidCommandFields {
  readonly issues: readonly { path: readonly PropertyKey[]; message: string }[]
  readonly message: string
}

export class InvalidCommandError extends Data.TaggedError(
  'InvalidCommandError',
)<InvalidCommandFields> {
  constructor(issues: InvalidCommandFields['issues']) {
    super({
      issues,
      message: `Comando de sincronización inválido: ${formatIssues(issues)}`,
    })
  }
}

const withOutbox = <A>(
  message: string,
  run: (db: IDBDatabase) => Promise<A>,
): Effect.Effect<A, ClientStorageError, ClientStorage> =>
  Effect.gen(function* () {
    const { outbox } = yield* ClientStorage
    return yield* Effect.tryPromise({
      try: () => run(outbox),
      catch: (cause) => storageError(cause, message),
    })
  })

/** Same as `withOutbox`, but a merge that breaks the entity schema stays a typed rejection. */
const withValidatedOutbox = <A>(
  message: string,
  run: (db: IDBDatabase) => Promise<A>,
): Effect.Effect<A, InvalidCommandError | ClientStorageError, ClientStorage> =>
  Effect.gen(function* () {
    const { outbox } = yield* ClientStorage
    return yield* Effect.tryPromise({
      try: () => run(outbox),
      catch: (cause) =>
        cause instanceof InvalidCommandError ? cause : storageError(cause, message),
    })
  })

/** Generates a client-side `commandId` for idempotent replay (`sync_commands.id`). */
export function generateCommandId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Extremely defensive fallback for environments without Web Crypto's
  // randomUUID (older browsers) — never hit in practice, just avoids a hard
  // crash on enqueue.
  return `cmd_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

/**
 * Validates one command the same way `enqueue` does, returning the parsed
 * command or throwing `InvalidCommandError`. Shared with the movement
 * publication transaction so a command written there gets the identical
 * guarantee without opening a second IndexedDB transaction.
 */
export function parseOutboxCommand(command: OutboxCommandInput): SyncCommandInput {
  const withId = { ...command, commandId: command.commandId ?? generateCommandId() }
  const parsed = syncCommandSchema.safeParse(withId)
  if (!parsed.success) {
    throw new InvalidCommandError(parsed.issues)
  }

  if (parsed.data.action === 'create') {
    const entityCheck = entityCreatePayloadSchemas[parsed.data.entityType].safeParse(
      parsed.data.data,
    )
    if (!entityCheck.success) {
      throw new InvalidCommandError(entityCheck.issues)
    }
  } else if (parsed.data.action === 'update') {
    const entityCheck = entityUpdateSchemas[parsed.data.entityType].safeParse(parsed.data.patch)
    if (!entityCheck.success) {
      throw new InvalidCommandError(entityCheck.issues)
    }
  }
  return parsed.data
}

/**
 * Validates and appends a command to the outbox. Adds `commandId` if the
 * caller didn't supply one. Fails with `InvalidCommandError` if the command
 * doesn't match the server's schema, or if its per-entity `data`/`patch`
 * doesn't match `entityCreatePayloadSchemas`/`entityUpdateSchemas` — the same
 * schemas `apply-command.ts` validates against server-side, applied here too
 * so a payload with no destination in the model fails visibly at the moment
 * it's typed, not silently once it reaches the server (audit §2.3, issue
 * #138). The *payload* schemas, not the bare create ones, because the client
 * may mint the entity's own identity (`id`, ADR 0001) and the server accepts
 * it in the same `create` — the bare schemas would reject it and drop the
 * write (issue #143). Enqueueing a bad command would otherwise poison the
 * batch (WP4's fail-fast semantics).
 */
export const enqueue = (
  command: OutboxCommandInput,
): Effect.Effect<OutboxEntry, InvalidCommandError | ClientStorageError, ClientStorage> =>
  Effect.gen(function* () {
    const parsed = yield* Effect.try({
      try: () => parseOutboxCommand(command),
      catch: (cause) => {
        if (cause instanceof InvalidCommandError) return cause
        throw cause
      },
    })

    const entry: Omit<OutboxEntry, 'seq'> = {
      command: parsed,
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
    }

    const seq = yield* withOutbox('No se pudo encolar el comando.', async (db) => {
      const tx = db.transaction(STORE, 'readwrite')
      const key = await requestToPromise(tx.objectStore(STORE).add(entry) as IDBRequest<number>)
      await txDone(tx)
      return key
    })
    return { ...entry, seq }
  })

/** Returns every queued entry, in FIFO order. */
export const listAll = (): Effect.Effect<OutboxEntry[], ClientStorageError, ClientStorage> =>
  withOutbox('No se pudo leer el outbox.', async (db) => {
    const tx = db.transaction(STORE, 'readonly')
    const result = await requestToPromise(
      tx.objectStore(STORE).getAll() as IDBRequest<OutboxEntry[]>,
    )
    await txDone(tx)
    return result
  })

/** Returns the next `limit` entries to send, in FIFO order (WP4 batches ≤5). */
export const peekBatch = (
  limit = 5,
): Effect.Effect<OutboxEntry[], ClientStorageError, ClientStorage> =>
  Effect.map(listAll(), (all) => all.slice(0, limit))

export const count = (): Effect.Effect<number, ClientStorageError, ClientStorage> =>
  withOutbox('No se pudo contar el outbox.', async (db) => {
    const tx = db.transaction(STORE, 'readonly')
    const result = await requestToPromise(tx.objectStore(STORE).count())
    await txDone(tx)
    return result
  })

/** Removes confirmed entries from the queue (server accepted/replayed them). */
export const acknowledge = (
  seqs: number[],
): Effect.Effect<void, ClientStorageError, ClientStorage> =>
  seqs.length === 0
    ? Effect.void
    : withOutbox('No se pudo confirmar el outbox.', async (db) => {
        const tx = db.transaction(STORE, 'readwrite')
        const store = tx.objectStore(STORE)
        for (const seq of seqs) {
          store.delete(seq)
        }
        await txDone(tx)
      })

/** Records a failed send attempt (retry/backoff bookkeeping) without dequeuing. */
export const recordFailure = (
  seq: number,
  error: string,
): Effect.Effect<void, ClientStorageError, ClientStorage> =>
  withOutbox('No se pudo registrar el fallo del outbox.', async (db) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const existing = await requestToPromise(store.get(seq) as IDBRequest<OutboxEntry | undefined>)
    if (existing) {
      store.put({ ...existing, attempts: existing.attempts + 1, lastError: error })
    }
    await txDone(tx)
  })

/** Empties the whole outbox (used by "empezar de cero" / discard-local-edits flows). */
export const clear = (): Effect.Effect<void, ClientStorageError, ClientStorage> =>
  withOutbox('No se pudo vaciar el outbox.', async (db) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    await txDone(tx)
  })

/**
 * Predicate over a still-queued `create`'s payload — the identity it is
 * addressable by before the server has acknowledged it.
 */
export type PendingCreateMatch = (data: Record<string, unknown>) => boolean

/**
 * Finds a still-queued `create` command for one entity type whose payload
 * matches — used by the client-side command-mapping layer
 * (`src/lib/client/command-mapping.ts`, WP7b) to fold a later edit into an
 * unacknowledged create, or cancel it outright, instead of emitting an
 * `update`/`remove` command the server can't yet address.
 *
 * The match is over the payload itself, not a data-derived correlation id:
 * an entity created from now on carries its own identity (`data.id`, ADR
 * 0001) from the first instant, and one with a real natural key (category
 * name+kind, budget cell, snapshot) is matched on those attributes.
 */
export const findPendingCreate = (
  entityType: SyncEntityType,
  match: PendingCreateMatch,
): Effect.Effect<OutboxEntry | undefined, ClientStorageError, ClientStorage> =>
  Effect.map(listAll(), (all) =>
    all.find(
      (entry) =>
        entry.command.action === 'create' &&
        entry.command.entityType === entityType &&
        match(entry.command.data as Record<string, unknown>),
    ),
  )

/**
 * Merges additional fields into a still-queued `create` command's `data`
 * payload (no-op if the entry no longer exists or isn't a pending create —
 * defensive against a race with `acknowledge`).
 *
 * Validates the merged `data` against `entityCreatePayloadSchemas` before
 * writing (fails with `InvalidCommandError`, leaving the still-queued create
 * untouched) — folding a patch in is as much "encolar" as a fresh `enqueue`
 * call, so it gets the same guarantee: a field with no destination fails here
 * instead of silently corrupting the pending create (issue #138). The payload
 * schema, not the bare create one, so a create that already carries the
 * client-minted identity keeps accepting patches (ADR 0001).
 */
export const amendPendingCreate = (
  seq: number,
  patch: Record<string, unknown>,
): Effect.Effect<void, InvalidCommandError | ClientStorageError, ClientStorage> =>
  withValidatedOutbox('No se pudo ampliar el comando pendiente.', async (db) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const existing = await requestToPromise(store.get(seq) as IDBRequest<OutboxEntry | undefined>)
    if (existing && existing.command.action === 'create') {
      const mergedData = { ...existing.command.data, ...patch }
      const entityCheck =
        entityCreatePayloadSchemas[existing.command.entityType].safeParse(mergedData)
      if (!entityCheck.success) {
        throw new InvalidCommandError(entityCheck.issues)
      }
      store.put({
        ...existing,
        command: { ...existing.command, data: mergedData },
      })
    }
    await txDone(tx)
  })

/**
 * Discards a still-queued command locally without contacting the server
 * (e.g. an entity created and deleted again before its `create` command
 * ever synced). Functionally identical to `acknowledge` for a single seq —
 * kept as a distinct export for call-site clarity (client-side cancel vs.
 * server-confirmed).
 */
export const discard = (seq: number): Effect.Effect<void, ClientStorageError, ClientStorage> =>
  withOutbox('No se pudo descartar el comando del outbox.', async (db) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(seq)
    await txDone(tx)
  })

/** Deletes the entire per-user outbox database (logout). */
export const wipeOutbox = (userId: string): Effect.Effect<void, ClientStorageError> =>
  Effect.tryPromise({
    try: () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(dbNameFor(userId))
        request.onsuccess = () => resolve(undefined)
        request.onerror = () =>
          reject(request.error ?? new Error('No se pudo borrar el outbox IndexedDB.'))
        request.onblocked = () =>
          reject(new Error('Otra pestaña mantiene abierto el outbox IndexedDB.'))
      }),
    catch: (cause) => storageError(cause, 'No se pudo borrar el outbox IndexedDB.'),
  })
