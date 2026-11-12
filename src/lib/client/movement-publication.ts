/**
 * Persisted publication discipline for movement writes (#489).
 *
 * Every movement command is written together with a per-movement generation
 * record in **one IndexedDB readwrite transaction** over the per-user outbox
 * database. IndexedDB serialises those transactions across connections, so a
 * second tab cannot publish between another tab's generation check and its
 * command write — the guarantee does not rely on Web Locks or any page-local
 * lock.
 *
 * The generation is what lets the instrument link wait out asynchronous
 * reference resolution and still respect whatever the user did meanwhile:
 * before publishing a target it captured at click time, the link passes the
 * generation it built its command from. A mismatch returns `stale` with the
 * current record, and the caller re-reads the movement instead of replaying
 * an old snapshot. A deletion, a change to an incompatible type or an
 * explicit later link/unlink is recorded here too, so a late continuation can
 * never restore or relink it.
 *
 * `#490` will add intent/progress stores to this same database; the atomic
 * publication below is the seam it extends, not replaces. It intentionally
 * does not persist a whole movement snapshot: the record is a generation and
 * a short fingerprint, and the command content is always rebuilt from the
 * movement's current state.
 */

import { Effect } from 'effect'

import { entityCreatePayloadSchemas } from '../server/sync/command-schemas'
import {
  COMMANDS_STORE,
  INTENTS_STORE,
  INTENT_PROGRESS_STORE,
  InvalidCommandError,
  MOVEMENT_PUBLICATIONS_STORE,
  parseOutboxCommand,
  requestToPromise,
  txDone,
  type OutboxEntry,
  type OutboxPublication,
} from './outbox'
import {
  markIntentStepQueued,
  readPublishableIntentStep,
  type IntentPublicationSlot,
} from './durable-intents'
import { ClientStorage, storageError, type ClientStorageError } from './storage'

type JsonRecord = Record<string, unknown>

/** How the movement keeps its link after the last published write. */
export interface MovementPublicationRecord {
  id: string
  generation: number
  status: 'active' | 'deleted'
  type: string
  /** Local instrument id the movement carries, or `null` when it carries none. */
  instrumentId: string | null
  /** The last write cleared an instrument a previous write had linked. */
  unlinked: boolean
  /** Page that produced the last write, so a stale tab can tell its own edits apart. */
  writerId: string
  origin: 'movement' | 'instrumentLink'
  /**
   * Fingerprint of the movement state that was published. It lets a tab that
   * lost the generation race prove whether its in-memory state already
   * reflects the other tab's write before rebuilding, without storing or
   * replaying a full snapshot.
   */
  fingerprint: string
  updatedAt: string
}

export type MovementCommandPlan =
  | { action: 'create'; data: JsonRecord }
  | {
      action: 'update'
      patch: JsonRecord
      /** Absent while the movement's create is still queued: the patch is folded into it. */
      ref?: { entityId: string; baseVersion: number }
    }
  | {
      action: 'remove'
      /** Absent while the movement's create is still queued: it is cancelled instead. */
      ref?: { entityId: string; baseVersion: number }
    }

export interface MovementPublicationInput {
  movementId: string
  plan: MovementCommandPlan
  origin: 'movement' | 'instrumentLink'
  type: string
  instrumentId: string | null
  fingerprint: string
  /** Only a link passes this: publish only if the persisted generation is still this one. */
  expectedGeneration?: number
  /** Marks the queued command as link-owned so a conflict re-evaluates it. */
  link?: { instrumentId: string }
  /**
   * Durable intent step this command carries out (#490). When present, the
   * command, its generation and the step's progress are written in the same
   * readwrite transaction, and a step another tab already advanced is skipped.
   */
  intent?: { intentId: string; step: string }
  /**
   * The movement was published without the instrument a still-running link
   * expects: a later explicit unlink that must win over the continuation.
   */
  unlinked?: boolean
}

export type MovementPublicationOutcome = 'published' | 'stale' | 'unresolved' | 'skipped'

export interface MovementPublicationResult {
  movementId: string
  outcome: MovementPublicationOutcome
  /** Persisted generation after a publication, or the conflicting one for `stale`. */
  generation: number
  seq?: number
  commandId?: string
  /** The record observed when the publication was rejected as stale. */
  record?: MovementPublicationRecord
}

const WRITER_STORAGE_KEY = 'finance-tracker-publication-writer'

/**
 * Identifies the browser tab, not the page load: it survives a reload (so a
 * tab recognises its own earlier publications as its own) and stays separate
 * between tabs (so a genuinely concurrent tab is detected). `sessionStorage`
 * is per-tab; environments without it fall back to a per-module id.
 */
function resolveWriterId(): string {
  try {
    const stored = sessionStorage.getItem(WRITER_STORAGE_KEY)
    if (stored) return stored
    const minted =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `tab_${Date.now()}_${Math.random().toString(36).slice(2)}`
    sessionStorage.setItem(WRITER_STORAGE_KEY, minted)
    return minted
  } catch {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `tab_${Date.now()}_${Math.random().toString(36).slice(2)}`
  }
}

const WRITER_ID = resolveWriterId()

export const movementPublicationWriterId = (): string => WRITER_ID

/**
 * Persists commands and their generations atomically. Rejects (whole
 * transaction, nothing written) with `InvalidCommandError` if a command does
 * not satisfy the shared sync contract.
 */
export const publishMovementCommands = (
  inputs: readonly MovementPublicationInput[],
  options: { writerId?: string } = {},
): Effect.Effect<
  MovementPublicationResult[],
  InvalidCommandError | ClientStorageError,
  ClientStorage
> =>
  Effect.gen(function* () {
    if (inputs.length === 0) return []
    const { outbox } = yield* ClientStorage
    return yield* Effect.tryPromise({
      try: () => runPublication(outbox, inputs, options.writerId ?? WRITER_ID),
      catch: (cause) =>
        cause instanceof InvalidCommandError
          ? cause
          : storageError(cause, 'No se pudo publicar el movimiento.'),
    })
  })

/** Reads persisted generations without writing; used to capture link targets. */
export const readMovementPublications = (
  movementIds: readonly string[],
): Effect.Effect<Map<string, MovementPublicationRecord>, ClientStorageError, ClientStorage> =>
  Effect.gen(function* () {
    if (movementIds.length === 0) return new Map()
    const { outbox } = yield* ClientStorage
    return yield* Effect.tryPromise({
      try: async () => {
        const tx = outbox.transaction(MOVEMENT_PUBLICATIONS_STORE, 'readonly')
        const store = tx.objectStore(MOVEMENT_PUBLICATIONS_STORE)
        const records = new Map<string, MovementPublicationRecord>()
        for (const id of new Set(movementIds)) {
          const record = (await requestToPromise(
            store.get(id) as IDBRequest<MovementPublicationRecord | undefined>,
          )) as MovementPublicationRecord | undefined
          if (record) records.set(id, record)
        }
        await txDone(tx)
        return records
      },
      catch: (cause) => storageError(cause, 'No se pudo leer el estado de publicación.'),
    })
  })

async function runPublication(
  db: IDBDatabase,
  inputs: readonly MovementPublicationInput[],
  writerId: string,
): Promise<MovementPublicationResult[]> {
  const stores = [COMMANDS_STORE, MOVEMENT_PUBLICATIONS_STORE]
  if (inputs.some((input) => input.intent)) {
    stores.push(INTENTS_STORE, INTENT_PROGRESS_STORE)
  }
  const tx = db.transaction(stores, 'readwrite')
  const done = txDone(tx)
  // The commit promise is observed below; on error the transaction is aborted
  // and its rejection is expected, not an unhandled one.
  done.catch(() => undefined)
  try {
    const results = await writePublications(tx, inputs, writerId)
    await done
    return results
  } catch (error) {
    // A rejected command must leave the queue exactly as it was: aborting the
    // shared transaction discards the commands and generations written before
    // the failure instead of committing them.
    try {
      tx.abort()
    } catch {
      // The transaction may already be finished; the original error wins.
    }
    throw error
  }
}

async function writePublications(
  tx: IDBTransaction,
  inputs: readonly MovementPublicationInput[],
  writerId: string,
): Promise<MovementPublicationResult[]> {
  const commands = tx.objectStore(COMMANDS_STORE)
  const publications = tx.objectStore(MOVEMENT_PUBLICATIONS_STORE)
  const results: MovementPublicationResult[] = []
  // Only the pending-create fallback needs the queue; read it lazily and drop
  // the cache after a write so a create folded earlier in the same batch is seen.
  const queued: { entries: OutboxEntry[] | null } = { entries: null }

  for (const input of inputs) {
    const slot: IntentPublicationSlot | null = input.intent
      ? await readPublishableIntentStep(tx, input.intent.intentId, input.intent.step)
      : null
    const existing = (await requestToPromise(
      publications.get(input.movementId) as IDBRequest<MovementPublicationRecord | undefined>,
    )) as MovementPublicationRecord | undefined
    const generation = existing?.generation ?? 0
    if (input.intent && !slot) {
      // Another tab already published (or the intent was retried/discarded):
      // this attempt must not create a second command for the same step.
      results.push({
        movementId: input.movementId,
        outcome: 'skipped',
        generation,
      })
      continue
    }
    if (input.expectedGeneration !== undefined && input.expectedGeneration !== generation) {
      results.push({
        movementId: input.movementId,
        outcome: 'stale',
        generation,
        record: existing,
      })
      continue
    }

    const nextGeneration = generation + 1
    const entryBase = {
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
      ...(input.intent ? { intent: input.intent } : {}),
      ...(input.link
        ? {
            publication: {
              movementId: input.movementId,
              origin: 'instrumentLink',
              generation: nextGeneration,
              instrumentId: input.link.instrumentId,
            } satisfies OutboxPublication,
          }
        : {}),
    }

    if (input.plan.action === 'create') {
      const command = parseOutboxCommand({
        action: 'create',
        entityType: 'transaction',
        data: input.plan.data,
      })
      const seq = await requestToPromise(
        commands.add({ command, ...entryBase }) as IDBRequest<number>,
      )
      queued.entries = null
      await putRecord(publications, input, existing, writerId, nextGeneration, {
        status: 'active',
      })
      if (slot) await markIntentStepQueued(tx, slot, command.commandId, seq)
      results.push({
        movementId: input.movementId,
        outcome: 'published',
        generation: nextGeneration,
        seq,
        commandId: command.commandId,
      })
      continue
    }

    if (input.plan.action === 'remove') {
      if (input.plan.ref) {
        const command = parseOutboxCommand({
          action: 'remove',
          entityType: 'transaction',
          entityId: input.plan.ref.entityId,
          baseVersion: input.plan.ref.baseVersion,
        })
        const seq = await requestToPromise(
          commands.add({ command, ...entryBase }) as IDBRequest<number>,
        )
        if (slot) await markIntentStepQueued(tx, slot, command.commandId, seq)
        results.push({
          movementId: input.movementId,
          outcome: 'published',
          generation: nextGeneration,
          seq,
          commandId: command.commandId,
        })
      } else {
        const pending = await findPendingCreate(commands, input.movementId, queued)
        if (pending) {
          commands.delete(pending.seq)
          queued.entries = null
        }
        results.push({
          movementId: input.movementId,
          outcome: 'published',
          generation: nextGeneration,
        })
      }
      await putRecord(publications, input, existing, writerId, nextGeneration, {
        status: 'deleted',
        instrumentId: null,
        fingerprint: '',
      })
      continue
    }

    // Update addressed at a server row.
    if (input.plan.ref) {
      const command = parseOutboxCommand({
        action: 'update',
        entityType: 'transaction',
        entityId: input.plan.ref.entityId,
        baseVersion: input.plan.ref.baseVersion,
        patch: input.plan.patch,
      })
      const seq = await requestToPromise(
        commands.add({ command, ...entryBase }) as IDBRequest<number>,
      )
      queued.entries = null
      await putRecord(publications, input, existing, writerId, nextGeneration, {
        status: 'active',
      })
      if (slot) await markIntentStepQueued(tx, slot, command.commandId, seq)
      results.push({
        movementId: input.movementId,
        outcome: 'published',
        generation: nextGeneration,
        seq,
        commandId: command.commandId,
      })
      continue
    }

    // Update whose create is still queued: fold the patch into it, as the
    // generic command mapping does, inside this same transaction.
    const pending = await findPendingCreate(commands, input.movementId, queued)
    if (!pending || pending.command.action !== 'create') {
      results.push({ movementId: input.movementId, outcome: 'unresolved', generation })
      continue
    }
    const merged = {
      ...(pending.command.data as JsonRecord),
      ...input.plan.patch,
      id: input.movementId,
    }
    const entityCheck = entityCreatePayloadSchemas.transaction.safeParse(merged)
    if (!entityCheck.success) {
      throw new InvalidCommandError(entityCheck.issues)
    }
    commands.put({
      ...pending,
      command: { ...pending.command, data: merged },
      ...(entryBase.publication ? { publication: entryBase.publication } : {}),
      ...(input.intent ? { intent: input.intent } : {}),
    })
    queued.entries = null
    await putRecord(publications, input, existing, writerId, nextGeneration, { status: 'active' })
    if (slot) {
      await markIntentStepQueued(tx, slot, pending.command.commandId, pending.seq)
    }
    results.push({
      movementId: input.movementId,
      outcome: 'published',
      generation: nextGeneration,
      seq: pending.seq,
      commandId: pending.command.commandId,
    })
  }

  return results
}

async function putRecord(
  store: IDBObjectStore,
  input: MovementPublicationInput,
  existing: MovementPublicationRecord | undefined,
  writerId: string,
  generation: number,
  next: { status: 'active' | 'deleted'; instrumentId?: string | null; fingerprint?: string },
): Promise<void> {
  const instrumentId = next.instrumentId !== undefined ? next.instrumentId : input.instrumentId
  const record: MovementPublicationRecord = {
    id: input.movementId,
    generation,
    status: next.status,
    type: input.type,
    instrumentId,
    unlinked:
      input.unlinked === true ||
      (instrumentId === null &&
        existing !== undefined &&
        (existing.instrumentId !== null || existing.unlinked)),
    writerId,
    origin: input.origin,
    fingerprint: next.fingerprint !== undefined ? next.fingerprint : input.fingerprint,
    updatedAt: new Date().toISOString(),
  }
  store.put(record)
}

async function findPendingCreate(
  store: IDBObjectStore,
  movementId: string,
  cache: { entries: OutboxEntry[] | null },
): Promise<OutboxEntry | undefined> {
  cache.entries ??= (await requestToPromise(store.getAll())) as OutboxEntry[]
  return cache.entries.find(
    (entry) =>
      entry.command.action === 'create' &&
      entry.command.entityType === 'transaction' &&
      (entry.command.data as JsonRecord).id === movementId,
  )
}
