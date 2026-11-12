/**
 * Durable intent records over the per-user queue database (#490).
 *
 * A financial action the user can start while offline is accepted only after
 * its intent and its fixed targets are persisted. The records live in the same
 * IndexedDB database as `commands` (see `outbox.ts`) so three things happen in
 * one readwrite transaction, serialised across tabs by IndexedDB itself:
 *
 * - accepting an intent and its fixed target ids;
 * - publishing the commands that carry out a step and marking that step
 *   `queued` (a second tab sees the step is no longer `pending` and does not
 *   publish it again);
 * - retiring an acknowledged command and advancing its step.
 *
 * `commands` entries stay byte-compatible with `POST /api/sync`: the intent
 * link only rides on the queue entry, never inside the command. The cache is a
 * separate, reconstructible database, so confirmed results are absorbed there
 * before this module retires the command; an interruption in between leaves
 * the same command available for an idempotent resend.
 *
 * This module is intentionally a storage protocol, not a flow executor: it
 * knows intent headers, named steps and command outcomes, while each caller
 * (`instrument-link.ts` today, recurring confirmations in #492) owns its own
 * rules and rebuilds commands from live state. #491 extends an intent with a
 * catalog-configuration dependency by using `waitingFor` and the same
 * accept/publish/retry/discard protocol.
 */

import { Effect } from 'effect'

import {
  COMMANDS_STORE,
  INTENTS_STORE,
  INTENT_PROGRESS_STORE,
  InvalidCommandError,
  generateCommandId,
  parseOutboxCommand,
  requestToPromise,
  txDone,
  type OutboxCommandInput,
  type OutboxEntry,
  type OutboxPublication,
} from './outbox'
import { ClientStorage, storageError, type ClientStorageError } from './storage'

/** A value that survives IndexedDB's structured clone unchanged. */
export type IntentPayloadValue = string | number | boolean | null
export type IntentPayload = Record<string, IntentPayloadValue>

export type DurableIntentKind = 'instrumentLink' | 'pendingConfirmation'
export type DurableIntentState =
  'local-saved' | 'waiting' | 'sending' | 'confirmed' | 'failed' | 'partial' | 'discarded'
export type IntentStepState =
  'pending' | 'queued' | 'sending' | 'confirmed' | 'failed' | 'cancelled'
/** Why an unresolved intent is not publishing yet. */
export type IntentWaitReason = 'connection' | 'catalog' | 'private-configuration'

export interface DurableIntentRecord {
  id: string
  kind: DurableIntentKind
  ownerUserId: string
  createdAt: string
  updatedAt: string
  state: DurableIntentState
  /** The ids fixed when the user asked; recovery never adds new ones. */
  targetIds: readonly string[]
  /** Kind-specific durable data (never a full old snapshot to replay). */
  payload: IntentPayload
  waitingFor: IntentWaitReason | null
  /** A definitive failure that needs an explicit retry or discard. */
  failure: string | null
  discardRequested: boolean
}

export interface IntentProgressRecord {
  /** `${intentId}:${step}` */
  id: string
  intentId: string
  step: string
  state: IntentStepState
  commandId: string | null
  seq: number | null
  /** Publication attempts for this step (each one is a new command). */
  attempt: number
  lastError: string | null
  claimedBy: string | null
  claimedAt: string | null
  updatedAt: string
}

export interface DurableIntentView {
  intent: DurableIntentRecord
  steps: IntentProgressRecord[]
}

export interface AcceptDurableIntentInput {
  id?: string
  kind: DurableIntentKind
  ownerUserId: string
  targetIds: readonly string[]
  payload?: IntentPayload
  /** Step keys; one per target by default (link) or named phases (#492). */
  steps?: readonly string[]
}

export interface IntentCommandInput {
  step: string
  command: OutboxCommandInput
  publication?: OutboxPublication
}

export interface PublishIntentCommandsResult {
  published: Array<{ step: string; seq: number; commandId: string }>
  skipped: string[]
}

export type IntentOutcomeStatus = 'confirmed' | 'failed' | 'pending' | 'uncertain'

export interface IntentCommandOutcome {
  entry: OutboxEntry
  status: IntentOutcomeStatus
  message?: string
}

export interface CommitIntentCommandsInput {
  /** Seqs of commands that do not belong to an intent. */
  plainSeqs?: readonly number[]
  outcomes: readonly IntentCommandOutcome[]
}

export interface CommitIntentCommandsResult {
  /** Intents whose conflicted step must be rebuilt from current state. */
  recover: string[]
}

export interface DiscardIntentResult {
  /** No uncertain request is left; the intent reached a terminal state. */
  finalized: boolean
  cancelled: number
  kept: number
  reconciling: number
}

export const INTENT_CLAIM_LEASE_MS = 30_000

const TERMINAL_INTENT_STATES: ReadonlySet<DurableIntentState> = new Set(['confirmed', 'discarded'])

export const isUnresolvedIntent = (intent: DurableIntentRecord): boolean =>
  intent.state !== 'confirmed' && intent.state !== 'discarded'

export const intentProgressId = (intentId: string, step: string): string => `${intentId}:${step}`

const TERMINAL_STEP_STATES: ReadonlySet<IntentStepState> = new Set(['confirmed', 'cancelled'])
const ACTIVE_STEP_STATES: ReadonlySet<IntentStepState> = new Set(['queued', 'sending'])

/** The state implied by step progress; the store's status surface renders it. */
export function deriveIntentState(
  intent: Pick<DurableIntentRecord, 'failure' | 'waitingFor'>,
  steps: readonly Pick<IntentProgressRecord, 'state'>[],
): DurableIntentState {
  const confirmed = steps.filter((step) => step.state === 'confirmed').length
  if (steps.some((step) => ACTIVE_STEP_STATES.has(step.state))) return 'sending'
  if (intent.failure !== null || steps.some((step) => step.state === 'failed'))
    return confirmed > 0 ? 'partial' : 'failed'
  if (steps.length > 0 && confirmed === steps.length) return 'confirmed'
  if (steps.some((step) => step.state === 'pending'))
    return intent.waitingFor ? 'waiting' : 'local-saved'
  return confirmed > 0 ? 'partial' : 'discarded'
}

function refreshed(
  intent: DurableIntentRecord,
  steps: IntentProgressRecord[],
): DurableIntentRecord {
  const next: DurableIntentRecord = {
    ...intent,
    state: deriveIntentState(intent, steps),
    updatedAt: new Date().toISOString(),
  }
  if (next.state !== 'waiting') next.waitingFor = null
  return next
}

function generateIntentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `intent_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function failureMessage(steps: readonly IntentProgressRecord[]): string | null {
  return steps.find((step) => step.state === 'failed' && step.lastError)?.lastError ?? null
}

function withQueueDb<A>(
  message: string,
  run: (db: IDBDatabase) => Promise<A>,
): Effect.Effect<A, ClientStorageError, ClientStorage> {
  return Effect.gen(function* () {
    const { outbox } = yield* ClientStorage
    return yield* Effect.tryPromise({
      try: () => run(outbox),
      catch: (cause) => storageError(cause, message),
    })
  })
}

/** Accepts an intent only once its header and fixed targets are durable. */
export const acceptDurableIntent = (
  input: AcceptDurableIntentInput,
): Effect.Effect<DurableIntentView, ClientStorageError, ClientStorage> =>
  withQueueDb('No se pudo guardar la vinculación en este dispositivo.', async (db) => {
    const tx = db.transaction([INTENTS_STORE, INTENT_PROGRESS_STORE], 'readwrite')
    const done = txDone(tx)
    done.catch(() => undefined)
    try {
      const now = new Date().toISOString()
      const intent: DurableIntentRecord = {
        id: input.id ?? generateIntentId(),
        kind: input.kind,
        ownerUserId: input.ownerUserId,
        createdAt: now,
        updatedAt: now,
        state: 'local-saved',
        targetIds: [...input.targetIds],
        payload: { ...(input.payload ?? {}) },
        waitingFor: null,
        failure: null,
        discardRequested: false,
      }
      const stepNames = [...(input.steps ?? input.targetIds)]
      const progressStore = tx.objectStore(INTENT_PROGRESS_STORE)
      await requestToPromise(tx.objectStore(INTENTS_STORE).add(intent) as IDBRequest<IDBValidKey>)
      const steps: IntentProgressRecord[] = []
      for (const step of stepNames) {
        const record: IntentProgressRecord = {
          id: intentProgressId(intent.id, step),
          intentId: intent.id,
          step,
          state: 'pending',
          commandId: null,
          seq: null,
          attempt: 0,
          lastError: null,
          claimedBy: null,
          claimedAt: null,
          updatedAt: now,
        }
        progressStore.add(record)
        steps.push(record)
      }
      await done
      return { intent, steps }
    } catch (error) {
      abortQuietly(tx)
      throw error
    }
  })

/** Reads the durable intents, oldest first, with their steps. */
export const listDurableIntents = (): Effect.Effect<
  DurableIntentView[],
  ClientStorageError,
  ClientStorage
> =>
  withQueueDb('No se pudieron leer las vinculaciones guardadas.', async (db) => {
    const tx = db.transaction([INTENTS_STORE, INTENT_PROGRESS_STORE], 'readonly')
    const intents = (await requestToPromise(
      tx.objectStore(INTENTS_STORE).getAll(),
    )) as DurableIntentRecord[]
    const progress = (await requestToPromise(
      tx.objectStore(INTENT_PROGRESS_STORE).getAll(),
    )) as IntentProgressRecord[]
    await txDone(tx)
    return intents
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((intent) => ({
        intent,
        steps: progress
          .filter((step) => step.intentId === intent.id)
          .sort((a, b) => a.step.localeCompare(b.step)),
      }))
  })

/**
 * Publishes one command per pending step in a single transaction with the
 * progress records. Only `pending` steps are publishable: another tab that
 * already moved a step forward makes this call skip it instead of creating a
 * second command.
 */
export const publishIntentCommands = (
  intentId: string,
  commands: readonly IntentCommandInput[],
): Effect.Effect<
  PublishIntentCommandsResult,
  InvalidCommandError | ClientStorageError,
  ClientStorage
> =>
  Effect.gen(function* () {
    const { outbox } = yield* ClientStorage
    return yield* Effect.tryPromise({
      try: () => runIntentPublication(outbox, intentId, commands),
      catch: (cause) =>
        cause instanceof InvalidCommandError
          ? cause
          : storageError(cause, 'No se pudo publicar la vinculación.'),
    })
  })

async function runIntentPublication(
  db: IDBDatabase,
  intentId: string,
  commands: readonly IntentCommandInput[],
): Promise<PublishIntentCommandsResult> {
  const tx = db.transaction([COMMANDS_STORE, INTENTS_STORE, INTENT_PROGRESS_STORE], 'readwrite')
  const done = txDone(tx)
  done.catch(() => undefined)
  try {
    const result = await writeIntentCommands(tx, intentId, commands)
    await done
    return result
  } catch (error) {
    abortQuietly(tx)
    throw error
  }
}

async function writeIntentCommands(
  tx: IDBTransaction,
  intentId: string,
  commands: readonly IntentCommandInput[],
): Promise<PublishIntentCommandsResult> {
  const intentsStore = tx.objectStore(INTENTS_STORE)
  const progressStore = tx.objectStore(INTENT_PROGRESS_STORE)
  const commandStore = tx.objectStore(COMMANDS_STORE)
  const intent = (await requestToPromise(
    intentsStore.get(intentId) as IDBRequest<DurableIntentRecord | undefined>,
  )) as DurableIntentRecord | undefined
  const result: PublishIntentCommandsResult = { published: [], skipped: [] }
  if (!intent) {
    result.skipped = commands.map((command) => command.step)
    return result
  }
  const blocked = intent.failure !== null || intent.discardRequested
  for (const input of commands) {
    const progress = (await requestToPromise(
      progressStore.get(intentProgressId(intentId, input.step)) as IDBRequest<
        IntentProgressRecord | undefined
      >,
    )) as IntentProgressRecord | undefined
    if (blocked || !progress || progress.state !== 'pending') {
      result.skipped.push(input.step)
      continue
    }
    const command = parseOutboxCommand(input.command)
    const now = new Date().toISOString()
    const entry: Omit<OutboxEntry, 'seq'> = {
      command,
      enqueuedAt: now,
      attempts: 0,
      ...(input.publication ? { publication: input.publication } : {}),
      intent: { intentId, step: input.step },
    }
    const seq = await requestToPromise(commandStore.add(entry) as IDBRequest<number>)
    progressStore.put({
      ...progress,
      state: 'queued',
      commandId: command.commandId,
      seq,
      attempt: progress.attempt + 1,
      lastError: null,
      claimedBy: null,
      claimedAt: null,
      updatedAt: now,
    } satisfies IntentProgressRecord)
    result.published.push({ step: input.step, seq, commandId: command.commandId })
  }
  if (result.published.length > 0) {
    const steps = await readIntentSteps(progressStore, intentId)
    intentsStore.put(refreshed({ ...intent, waitingFor: null }, steps))
  }
  return result
}

/**
 * Marks the commands a tab is about to send as `sending`. The read/write on a
 * step is the compare-and-set that keeps two tabs from publishing the same
 * outcome; the lease lets a restarted tab take over an abandoned claim. Plain
 * commands (no intent) are always claimable, exactly as before.
 */
export const claimIntentCommands = (
  seqs: readonly number[],
  writerId: string,
  now = Date.now(),
): Effect.Effect<Set<number>, ClientStorageError, ClientStorage> =>
  withQueueDb('No se pudo reclamar el envío de la vinculación.', async (db) => {
    const tx = db.transaction([COMMANDS_STORE, INTENT_PROGRESS_STORE], 'readwrite')
    const done = txDone(tx)
    done.catch(() => undefined)
    const commandStore = tx.objectStore(COMMANDS_STORE)
    const progressStore = tx.objectStore(INTENT_PROGRESS_STORE)
    const claimable = new Set<number>()
    try {
      for (const seq of seqs) {
        const entry = (await requestToPromise(
          commandStore.get(seq) as IDBRequest<OutboxEntry | undefined>,
        )) as OutboxEntry | undefined
        if (!entry) continue
        if (!entry.intent) {
          claimable.add(seq)
          continue
        }
        const progress = (await requestToPromise(
          progressStore.get(
            intentProgressId(entry.intent.intentId, entry.intent.step),
          ) as IDBRequest<IntentProgressRecord | undefined>,
        )) as IntentProgressRecord | undefined
        if (!progress || TERMINAL_STEP_STATES.has(progress.state)) continue
        if (
          progress.claimedBy &&
          progress.claimedBy !== writerId &&
          progress.claimedAt &&
          now - Date.parse(progress.claimedAt) < INTENT_CLAIM_LEASE_MS
        )
          continue
        progressStore.put({
          ...progress,
          state: 'sending',
          claimedBy: writerId,
          claimedAt: new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString(),
        } satisfies IntentProgressRecord)
        claimable.add(seq)
      }
      await done
      return claimable
    } catch (error) {
      abortQuietly(tx)
      throw error
    }
  })

/** Releases a claim after a failed send: the same command stays resendable. */
export const releaseIntentClaims = (
  seqs: readonly number[],
): Effect.Effect<void, ClientStorageError, ClientStorage> =>
  seqs.length === 0
    ? Effect.void
    : withQueueDb('No se pudo liberar el envío de la vinculación.', async (db) => {
        const tx = db.transaction([COMMANDS_STORE, INTENT_PROGRESS_STORE], 'readwrite')
        const done = txDone(tx)
        done.catch(() => undefined)
        const commandStore = tx.objectStore(COMMANDS_STORE)
        const progressStore = tx.objectStore(INTENT_PROGRESS_STORE)
        try {
          for (const seq of seqs) {
            const entry = (await requestToPromise(
              commandStore.get(seq) as IDBRequest<OutboxEntry | undefined>,
            )) as OutboxEntry | undefined
            if (!entry?.intent) continue
            const record = (await requestToPromise(
              progressStore.get(
                intentProgressId(entry.intent.intentId, entry.intent.step),
              ) as IDBRequest<IntentProgressRecord | undefined>,
            )) as IntentProgressRecord | undefined
            if (record?.claimedBy) {
              progressStore.put({
                ...record,
                claimedBy: null,
                claimedAt: null,
                updatedAt: new Date().toISOString(),
              } satisfies IntentProgressRecord)
            }
          }
          await done
        } catch (error) {
          abortQuietly(tx)
          throw error
        }
      })

/**
 * Retires acknowledged commands and advances their steps in one transaction.
 * `plainSeqs` are commands without an intent. `uncertain` outcomes (a lost
 * response or a cache that could not absorb the result) keep both the command
 * and its step alive so the same id/content is resent.
 */
export const commitIntentCommands = (
  input: CommitIntentCommandsInput,
): Effect.Effect<CommitIntentCommandsResult, ClientStorageError, ClientStorage> =>
  withQueueDb('No se pudo confirmar la vinculación.', async (db) => {
    const tx = db.transaction([COMMANDS_STORE, INTENTS_STORE, INTENT_PROGRESS_STORE], 'readwrite')
    const done = txDone(tx)
    done.catch(() => undefined)
    try {
      const result = await writeCommit(tx, input)
      await done
      return result
    } catch (error) {
      abortQuietly(tx)
      throw error
    }
  })

async function writeCommit(
  tx: IDBTransaction,
  input: CommitIntentCommandsInput,
): Promise<CommitIntentCommandsResult> {
  const commandStore = tx.objectStore(COMMANDS_STORE)
  const intentsStore = tx.objectStore(INTENTS_STORE)
  const progressStore = tx.objectStore(INTENT_PROGRESS_STORE)
  const now = new Date().toISOString()
  const recover = new Set<string>()
  const affected = new Map<string, DurableIntentRecord>()

  for (const seq of input.plainSeqs ?? []) commandStore.delete(seq)

  for (const outcome of input.outcomes) {
    const { entry } = outcome
    const ref = entry.intent
    if (!ref) {
      commandStore.delete(entry.seq)
      continue
    }
    const progress = (await requestToPromise(
      progressStore.get(intentProgressId(ref.intentId, ref.step)) as IDBRequest<
        IntentProgressRecord | undefined
      >,
    )) as IntentProgressRecord | undefined
    let intent = affected.get(ref.intentId)
    if (!intent) {
      intent = (await requestToPromise(
        intentsStore.get(ref.intentId) as IDBRequest<DurableIntentRecord | undefined>,
      )) as DurableIntentRecord | undefined
      if (intent) affected.set(ref.intentId, intent)
    }
    if (!progress) {
      commandStore.delete(entry.seq)
      continue
    }
    if (TERMINAL_STEP_STATES.has(progress.state)) {
      // The step already reached a terminal state (a duplicated acknowledgement):
      // never advance it twice.
      commandStore.delete(entry.seq)
      continue
    }
    if (outcome.status === 'uncertain') {
      progressStore.put({
        ...progress,
        state: 'sending',
        claimedBy: null,
        claimedAt: null,
        lastError: outcome.message ?? progress.lastError,
        updatedAt: now,
      } satisfies IntentProgressRecord)
      continue
    }
    commandStore.delete(entry.seq)
    if (outcome.status === 'confirmed') {
      progressStore.put({
        ...progress,
        state: 'confirmed',
        seq: null,
        claimedBy: null,
        claimedAt: null,
        lastError: null,
        updatedAt: now,
      } satisfies IntentProgressRecord)
    } else if (outcome.status === 'failed') {
      progressStore.put({
        ...progress,
        state: 'failed',
        seq: null,
        claimedBy: null,
        claimedAt: null,
        lastError: outcome.message ?? 'El servidor rechazó este movimiento.',
        updatedAt: now,
      } satisfies IntentProgressRecord)
    } else {
      // Conflict: drop the stale command and rebuild from current state.
      progressStore.put({
        ...progress,
        state: 'pending',
        seq: null,
        claimedBy: null,
        claimedAt: null,
        lastError: null,
        updatedAt: now,
      } satisfies IntentProgressRecord)
      recover.add(ref.intentId)
    }
  }

  for (const [intentId, intent] of affected) {
    let steps = await readIntentSteps(progressStore, intentId)
    let next = intent
    if (intent.discardRequested) {
      next = await settleDiscard(progressStore, intent, steps, now)
      steps = await readIntentSteps(progressStore, intentId)
    }
    const failure = failureMessage(steps)
    intentsStore.put({
      ...refreshed(next, steps),
      failure: next.failure ?? failure,
    })
  }
  return { recover: [...recover] }
}

/** Cancels the remaining cancellable steps of a discarded intent. */
async function settleDiscard(
  progressStore: IDBObjectStore,
  intent: DurableIntentRecord,
  steps: IntentProgressRecord[],
  now: string,
): Promise<DurableIntentRecord> {
  for (const step of steps) {
    if (step.state === 'failed' || step.state === 'pending') {
      progressStore.put({
        ...step,
        state: 'cancelled',
        seq: null,
        commandId: null,
        claimedBy: null,
        claimedAt: null,
        lastError: null,
        updatedAt: now,
      } satisfies IntentProgressRecord)
    }
  }
  const settled = await readIntentSteps(progressStore, intent.id)
  const uncertain = settled.some((step) => step.state === 'queued' || step.state === 'sending')
  return {
    ...intent,
    discardRequested: uncertain,
    failure: uncertain ? intent.failure : null,
    updatedAt: now,
  }
}

/** Marks an intent as waiting for a dependency instead of fabricating work. */
export const markIntentWaiting = (
  intentId: string,
  reason: IntentWaitReason,
): Effect.Effect<void, ClientStorageError, ClientStorage> =>
  withQueueDb('No se pudo guardar el estado de la vinculación.', async (db) => {
    const tx = db.transaction([INTENTS_STORE, INTENT_PROGRESS_STORE], 'readwrite')
    const done = txDone(tx)
    done.catch(() => undefined)
    try {
      const intent = (await requestToPromise(
        tx.objectStore(INTENTS_STORE).get(intentId) as IDBRequest<DurableIntentRecord | undefined>,
      )) as DurableIntentRecord | undefined
      if (intent && !TERMINAL_INTENT_STATES.has(intent.state)) {
        const steps = await readIntentSteps(tx.objectStore(INTENT_PROGRESS_STORE), intentId)
        tx.objectStore(INTENTS_STORE).put(
          refreshed({ ...intent, waitingFor: reason, failure: null }, steps),
        )
      }
      await done
    } catch (error) {
      abortQuietly(tx)
      throw error
    }
  })

/** A definitive failure the user can retry or discard. */
export const failDurableIntent = (
  intentId: string,
  message: string,
): Effect.Effect<void, ClientStorageError, ClientStorage> =>
  withQueueDb('No se pudo guardar el fallo de la vinculación.', async (db) => {
    const tx = db.transaction([INTENTS_STORE, INTENT_PROGRESS_STORE], 'readwrite')
    const done = txDone(tx)
    done.catch(() => undefined)
    try {
      const intent = (await requestToPromise(
        tx.objectStore(INTENTS_STORE).get(intentId) as IDBRequest<DurableIntentRecord | undefined>,
      )) as DurableIntentRecord | undefined
      if (intent && !TERMINAL_INTENT_STATES.has(intent.state)) {
        const steps = await readIntentSteps(tx.objectStore(INTENT_PROGRESS_STORE), intentId)
        tx.objectStore(INTENTS_STORE).put(
          refreshed({ ...intent, waitingFor: null, failure: message }, steps),
        )
      }
      await done
    } catch (error) {
      abortQuietly(tx)
      throw error
    }
  })

/** Cancels one step that a later change invalidated (deleted/relinked target). */
export const cancelIntentStep = (
  intentId: string,
  step: string,
): Effect.Effect<void, ClientStorageError, ClientStorage> =>
  withQueueDb('No se pudo cancelar el objetivo de la vinculación.', async (db) => {
    const tx = db.transaction([INTENTS_STORE, INTENT_PROGRESS_STORE], 'readwrite')
    const done = txDone(tx)
    done.catch(() => undefined)
    try {
      const intent = (await requestToPromise(
        tx.objectStore(INTENTS_STORE).get(intentId) as IDBRequest<DurableIntentRecord | undefined>,
      )) as DurableIntentRecord | undefined
      const progressStore = tx.objectStore(INTENT_PROGRESS_STORE)
      const progress = (await requestToPromise(
        progressStore.get(intentProgressId(intentId, step)) as IDBRequest<
          IntentProgressRecord | undefined
        >,
      )) as IntentProgressRecord | undefined
      if (intent && progress && (progress.state === 'pending' || progress.state === 'failed')) {
        progressStore.put({
          ...progress,
          state: 'cancelled',
          commandId: null,
          seq: null,
          claimedBy: null,
          claimedAt: null,
          lastError: null,
          updatedAt: new Date().toISOString(),
        } satisfies IntentProgressRecord)
        const steps = await readIntentSteps(progressStore, intentId)
        tx.objectStore(INTENTS_STORE).put(refreshed(intent, steps))
      }
      await done
    } catch (error) {
      abortQuietly(tx)
      throw error
    }
  })

/** Explicit retry: the same movement identity, a fresh command attempt. */
export const retryDurableIntent = (
  intentId: string,
): Effect.Effect<DurableIntentView | null, ClientStorageError, ClientStorage> =>
  withQueueDb('No se pudo reintentar la vinculación.', async (db) => {
    const tx = db.transaction([INTENTS_STORE, INTENT_PROGRESS_STORE], 'readwrite')
    const done = txDone(tx)
    done.catch(() => undefined)
    try {
      const intentsStore = tx.objectStore(INTENTS_STORE)
      const progressStore = tx.objectStore(INTENT_PROGRESS_STORE)
      const intent = (await requestToPromise(
        intentsStore.get(intentId) as IDBRequest<DurableIntentRecord | undefined>,
      )) as DurableIntentRecord | undefined
      if (!intent) {
        await done
        return null
      }
      const now = new Date().toISOString()
      for (const step of await readIntentSteps(progressStore, intentId)) {
        if (step.state === 'failed' || step.state === 'cancelled') {
          progressStore.put({
            ...step,
            state: 'pending',
            commandId: null,
            seq: null,
            claimedBy: null,
            claimedAt: null,
            lastError: null,
            updatedAt: now,
          } satisfies IntentProgressRecord)
        }
      }
      const steps = await readIntentSteps(progressStore, intentId)
      const next = refreshed(
        { ...intent, failure: null, waitingFor: null, discardRequested: false },
        steps,
      )
      intentsStore.put(next)
      await done
      return { intent: next, steps }
    } catch (error) {
      abortQuietly(tx)
      throw error
    }
  })

/**
 * Cancels the remaining cancellable work. Confirmed effects are kept; a
 * command already claimed/sent is not declared cancelled — it is left for an
 * idempotent reconciliation and the intent stays visibly in progress.
 */
export const discardDurableIntent = (
  intentId: string,
): Effect.Effect<DiscardIntentResult | null, ClientStorageError, ClientStorage> =>
  withQueueDb('No se pudo descartar la vinculación.', async (db) => {
    const tx = db.transaction([COMMANDS_STORE, INTENTS_STORE, INTENT_PROGRESS_STORE], 'readwrite')
    const done = txDone(tx)
    done.catch(() => undefined)
    try {
      const result = await writeDiscard(tx, intentId)
      await done
      return result
    } catch (error) {
      abortQuietly(tx)
      throw error
    }
  })

async function writeDiscard(
  tx: IDBTransaction,
  intentId: string,
): Promise<DiscardIntentResult | null> {
  const intentsStore = tx.objectStore(INTENTS_STORE)
  const progressStore = tx.objectStore(INTENT_PROGRESS_STORE)
  const commandStore = tx.objectStore(COMMANDS_STORE)
  const intent = (await requestToPromise(
    intentsStore.get(intentId) as IDBRequest<DurableIntentRecord | undefined>,
  )) as DurableIntentRecord | undefined
  if (!intent) return null
  const now = new Date().toISOString()
  let cancelled = 0
  let kept = 0
  let reconciling = 0
  for (const step of await readIntentSteps(progressStore, intentId)) {
    if (step.state === 'confirmed') {
      kept += 1
      continue
    }
    if (step.state === 'cancelled') continue
    if (step.state === 'pending' || step.state === 'failed') {
      progressStore.put({
        ...step,
        state: 'cancelled',
        commandId: null,
        seq: null,
        claimedBy: null,
        claimedAt: null,
        lastError: null,
        updatedAt: now,
      } satisfies IntentProgressRecord)
      cancelled += 1
      continue
    }
    const entry =
      step.seq === null
        ? undefined
        : ((await requestToPromise(
            commandStore.get(step.seq) as IDBRequest<OutboxEntry | undefined>,
          )) as OutboxEntry | undefined)
    if (!entry) {
      // Nothing is left to cancel: the command was already retired.
      progressStore.put({
        ...step,
        state: 'cancelled',
        commandId: null,
        seq: null,
        claimedBy: null,
        claimedAt: null,
        updatedAt: now,
      } satisfies IntentProgressRecord)
      cancelled += 1
      continue
    }
    const sent = entry.attempts > 0 || step.claimedBy !== null || step.state === 'sending'
    if (sent) {
      progressStore.put({
        ...step,
        state: 'sending',
        claimedBy: null,
        claimedAt: null,
        updatedAt: now,
      } satisfies IntentProgressRecord)
      reconciling += 1
      continue
    }
    // Never sent: safe to cancel locally in this same transaction.
    commandStore.delete(entry.seq)
    progressStore.put({
      ...step,
      state: 'cancelled',
      commandId: null,
      seq: null,
      claimedBy: null,
      claimedAt: null,
      updatedAt: now,
    } satisfies IntentProgressRecord)
    cancelled += 1
  }
  const steps = await readIntentSteps(progressStore, intentId)
  intentsStore.put(
    refreshed(
      {
        ...intent,
        discardRequested: reconciling > 0,
        failure: reconciling > 0 ? intent.failure : null,
      },
      steps,
    ),
  )
  return { finalized: reconciling === 0, cancelled, kept, reconciling }
}

/**
 * Pending work as the user understands it: queued commands plus unresolved
 * intents that have no live command (counting both would double count a link
 * that already published its commands).
 */
export const countDurableWork = (): Effect.Effect<number, ClientStorageError, ClientStorage> =>
  withQueueDb('No se pudo contar el trabajo pendiente.', async (db) => {
    const tx = db.transaction([COMMANDS_STORE, INTENTS_STORE, INTENT_PROGRESS_STORE], 'readonly')
    const entries = (await requestToPromise(
      tx.objectStore(COMMANDS_STORE).getAll() as IDBRequest<OutboxEntry[]>,
    )) as OutboxEntry[]
    const intents = (await requestToPromise(
      tx.objectStore(INTENTS_STORE).getAll() as IDBRequest<DurableIntentRecord[]>,
    )) as DurableIntentRecord[]
    const progress = (await requestToPromise(
      tx.objectStore(INTENT_PROGRESS_STORE).getAll() as IDBRequest<IntentProgressRecord[]>,
    )) as IntentProgressRecord[]
    await txDone(tx)
    let total = entries.length
    for (const intent of intents) {
      if (!isUnresolvedIntent(intent)) continue
      if (entries.some((entry) => entry.intent?.intentId === intent.id)) continue
      const hasRemainingWork = progress.some(
        (step) =>
          step.intentId === intent.id &&
          (step.state === 'pending' ||
            step.state === 'queued' ||
            step.state === 'sending' ||
            step.state === 'failed'),
      )
      if (hasRemainingWork) total += 1
    }
    return total
  })

async function readIntentSteps(
  store: IDBObjectStore,
  intentId: string,
): Promise<IntentProgressRecord[]> {
  const all = (await requestToPromise(
    store.getAll() as IDBRequest<IntentProgressRecord[]>,
  )) as IntentProgressRecord[]
  return all.filter((step) => step.intentId === intentId)
}

function abortQuietly(tx: IDBTransaction): void {
  try {
    tx.abort()
  } catch {
    // The transaction may already be finished; the original error wins.
  }
}

// -- low-level helpers shared with the movement publication transaction (#489/#490) --

export interface IntentPublicationSlot {
  intent: DurableIntentRecord
  progress: IntentProgressRecord
}

/**
 * Reads the intent step a movement publication is about to advance. Returns
 * `null` when the intent does not exist or the step is not publishable, which
 * the caller reports as `skipped` without writing a command.
 */
export async function readPublishableIntentStep(
  tx: IDBTransaction,
  intentId: string,
  step: string,
): Promise<IntentPublicationSlot | null> {
  const intent = (await requestToPromise(
    tx.objectStore(INTENTS_STORE).get(intentId) as IDBRequest<DurableIntentRecord | undefined>,
  )) as DurableIntentRecord | undefined
  if (!intent || intent.failure !== null || intent.discardRequested) return null
  const progress = (await requestToPromise(
    tx.objectStore(INTENT_PROGRESS_STORE).get(intentProgressId(intentId, step)) as IDBRequest<
      IntentProgressRecord | undefined
    >,
  )) as IntentProgressRecord | undefined
  if (!progress || progress.state !== 'pending') return null
  return { intent, progress }
}

/** Marks a published step as queued and refreshes the intent state, same tx. */
export async function markIntentStepQueued(
  tx: IDBTransaction,
  slot: IntentPublicationSlot,
  commandId: string,
  seq: number,
): Promise<void> {
  const now = new Date().toISOString()
  const progressStore = tx.objectStore(INTENT_PROGRESS_STORE)
  progressStore.put({
    ...slot.progress,
    state: 'queued',
    commandId,
    seq,
    attempt: slot.progress.attempt + 1,
    lastError: null,
    claimedBy: null,
    claimedAt: null,
    updatedAt: now,
  } satisfies IntentProgressRecord)
  const steps = await readIntentSteps(progressStore, slot.intent.id)
  tx.objectStore(INTENTS_STORE).put(refreshed({ ...slot.intent, waitingFor: null }, steps))
}

/** The `commandId` currently assigned to a step, reused on uncertain resend. */
export async function currentIntentCommandId(
  tx: IDBTransaction,
  intentId: string,
  step: string,
): Promise<string | null> {
  const progress = (await requestToPromise(
    tx.objectStore(INTENT_PROGRESS_STORE).get(intentProgressId(intentId, step)) as IDBRequest<
      IntentProgressRecord | undefined
    >,
  )) as IntentProgressRecord | undefined
  return progress?.commandId ?? null
}

/** Recomputes an intent state after a step changed outside this module. */
export async function refreshIntent(tx: IDBTransaction, intentId: string): Promise<void> {
  const intentsStore = tx.objectStore(INTENTS_STORE)
  const intent = (await requestToPromise(
    intentsStore.get(intentId) as IDBRequest<DurableIntentRecord | undefined>,
  )) as DurableIntentRecord | undefined
  if (!intent) return
  const steps = await readIntentSteps(tx.objectStore(INTENT_PROGRESS_STORE), intentId)
  intentsStore.put({
    ...refreshed(intent, steps),
    failure: intent.failure ?? failureMessage(steps),
  })
}

/** Exposed for tests and for the store's command id minting. */
export { generateCommandId as generateIntentCommandId }
