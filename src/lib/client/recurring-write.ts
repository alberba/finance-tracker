/**
 * Durable recurring writes: confirming a pending movement (#492).
 *
 * The caller (the recurring store) makes the financial decision — it resolves
 * the edit, validates it and builds the movement. This module receives that
 * decision and hides the rest: persisting a reservation per pending before the
 * optimistic confirmation, resolving the private references when the commands
 * are published, publishing the movement **before** the pending update that
 * references it, and resuming or settling the work after a reload.
 *
 * It shares only the transactional mechanisms #490 introduced (the durable
 * intent header/progress records in the queue database and the atomic
 * movement publication); it is not a generic flow executor and has no rule of
 * its own. Rule, occurrence and calendar coordination lives in its sibling
 * `recurring-rule-write.ts` (#493), with only the small protocol vocabulary in
 * `recurring-intent-support.ts` shared.
 *
 * Boundary (ADR-0006): this module is invoked exclusively from Pinia actions,
 * the documented edge where promises are executed. The Effect-based storage
 * protocol stays in `durable-intents`/`movement-publication`/`outbox`.
 *
 * Guarantees:
 * - A reservation is unique per pending (its intent id is derived from the
 *   pending id) and keeps the resolved edit, **one** movement id and the
 *   timestamps. The movement command is published in the same transaction that
 *   accepts the reservation; if the acceptance fails, neither exists. A second
 *   tab or a reload reads the reservation instead of deciding again.
 * - The pending update is only built after the server acknowledged that
 *   movement, so a pending never points at a movement that could not exist. A
 *   failure keeps the reservation; the next resume retries from the stored
 *   decision.
 * - Commands keep their own `commandId`/content while their outcome is
 *   uncertain. Only an explicit retry after a definitive failure publishes a
 *   new attempt, keeping the movement identity.
 * - Discarding never reverts a confirmed movement; the reservation stays so a
 *   repeat cannot create a second one, and the partial result stays visible.
 *   A pending already confirmed and linked is forgotten so the queue cannot
 *   grow without bound.
 */

import { applyPendingEdit, type ResolvedPendingEdit } from '../../domain/recurring/pending'
import type { InvestmentSide, Transaction } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useSyncStore } from '../../stores/sync'
import { resolveEntityId, resolveOrCreateCategoryId, type CategoryKind } from './command-mapping'
import { isReadOnlyDemoActive } from './demo-source'
import {
  isUnresolvedIntent,
  type DurableIntentKind,
  type DurableIntentRecord,
  type DurableIntentState,
  type DurableIntentView,
  type IntentPayload,
  type IntentWaitReason,
} from './durable-intents'
import { buildMovementData, movementFingerprint } from './movement-commands'
import { movementPublicationWriterId } from './movement-publication'
import type { OutboxCommandInput } from './outbox'
import {
  RECONCILING_MESSAGE,
  operationData,
  payloadNumber,
  payloadText,
  stepOf,
} from './recurring-intent-support'

/** The user's already-decided confirmation of one pending movement. */
export interface PendingConfirmationRequest {
  pendingId: string
  /** The pending's rule, kept so the update resolves the same parent. */
  ruleId: string
  /** The financial fields after the edit, validated by the caller. */
  resolved: ResolvedPendingEdit
  /** The movement the user accepted, with its single minted id and timestamps. */
  transaction: Transaction
  /** The user edited the pending before confirming it. */
  edited: boolean
  /** The pending row's own timestamps, preserved across a reload. */
  pendingCreatedAt: string
  pendingUpdatedAt: string
}

export type PendingConfirmationFailureReason =
  'invalid' | 'not-found' | 'storage' | 'reconciling' | 'conflict'

export type PendingConfirmationOutcome =
  | { accepted: true; transactionId: string }
  | { accepted: false; reason: PendingConfirmationFailureReason; message?: string }

/** The reservation as the status surfaces need it, without phases or closures. */
export interface PendingConfirmationStatus {
  pendingId: string
  transactionId: string
  state: DurableIntentState
  movementQueued: boolean
  movementConfirmed: boolean
  pendingLinked: boolean
  waitingFor: IntentWaitReason | null
  failure: string | null
  discarded: boolean
}

export interface PendingConfirmationDiscard {
  discarded: boolean
  /** The movement had already been confirmed: it is kept, the link is not. */
  keptMovement: boolean
  message?: string
}

const PENDING_CONFIRMATION_KIND = 'pendingConfirmation' as const
const MOVEMENT_STEP = 'movement'
const PENDING_STEP = 'pending'
const INTENT_PREFIX = 'pendingConfirmation:'

/**
 * The reservation's durable name. Derived from the pending's own identity
 * (ADR 0001), so two tabs confirming the same pending agree on one record.
 */
const pendingConfirmationIntentId = (pendingId: string): string =>
  `${INTENT_PREFIX}${pendingId}`

export const PARTIAL_CONFIRMATION_MESSAGE =
  'El movimiento se guardó, pero el pendiente no se pudo enlazar. Reintenta para completarlo sin duplicar el movimiento.'

interface StoredDecision {
  pendingId: string
  ruleId: string
  resolved: ResolvedPendingEdit
  transaction: Transaction
  edited: boolean
  pendingCreatedAt: string
  pendingUpdatedAt: string
}

// -- public interface ---------------------------------------------------------

/**
 * Accepts a pending confirmation. Resolves after the reservation is durable,
 * the optimistic confirmation is projected and the publication was kicked
 * off; it never waits for the server. Without an authenticated sync runtime
 * (demo or fixtures) it keeps the previous memory-only behaviour.
 */
export async function confirmPendingMovement(
  request: PendingConfirmationRequest,
): Promise<PendingConfirmationOutcome> {
  if (isReadOnlyDemoActive()) {
    projectDecision(request)
    return { accepted: true, transactionId: request.transaction.id }
  }
  const syncStore = useSyncStore()
  const ownerUserId = syncStore.userId
  if (!ownerUserId) {
    projectDecision(request)
    return { accepted: true, transactionId: request.transaction.id }
  }

  const intentId = pendingConfirmationIntentId(request.pendingId)
  // The movement command commits in the same transaction that accepts the
  // reservation (#490/#491): there is no accepted state whose first effect is
  // not already durable. If a required reference is still unresolved, the
  // reservation is accepted as waiting and publishes the movement later.
  const movementCommand = await buildAcceptanceMovementCommand(request)
  const accepted = await syncStore.acceptPendingConfirmation({
    id: intentId,
    kind: PENDING_CONFIRMATION_KIND,
    ownerUserId,
    targetIds: [request.pendingId],
    steps: [MOVEMENT_STEP, PENDING_STEP],
    payload: encodeDecision(request),
    ...(movementCommand
      ? {
          commands: [{ step: MOVEMENT_STEP, command: movementCommand }],
          // The generation record is durable with the command itself (#489):
          // a movement accepted here is not an implicit generation 0 for the
          // link module, it is a published movement.
          publications: [
            {
              id: request.transaction.id,
              status: 'active' as const,
              type: request.transaction.type,
              instrumentId: request.transaction.instrumentId ?? null,
              unlinked: false,
              origin: 'movement' as const,
              fingerprint: movementFingerprint(request.transaction),
              writerId: movementPublicationWriterId(),
            },
          ],
        }
      : { waitingFor: 'private-configuration' as const }),
  })
  if (!accepted) {
    return {
      accepted: false,
      reason: 'storage',
      message: syncStore.lastError ?? undefined,
    }
  }
  if (accepted.intent.ownerUserId !== ownerUserId) {
    return {
      accepted: false,
      reason: 'storage',
      message: 'La confirmación pertenece a otra sesión.',
    }
  }
  const stored = decodeDecision(accepted.intent.payload)
  if (!stored) {
    return {
      accepted: false,
      reason: 'storage',
      message: 'No se pudo leer la confirmación guardada.',
    }
  }
  if (accepted.intent.discardRequested) {
    return {
      accepted: false,
      reason: 'reconciling',
      message: RECONCILING_MESSAGE,
    }
  }
  // A failure or an explicit discard was the previous word on this pending: a
  // new confirmation is a new command attempt over the same movement identity.
  if (needsExplicitRetry(accepted)) {
    const retried = await syncStore.retryIntent(intentId)
    if (!retried) {
      return { accepted: false, reason: 'storage', message: syncStore.lastError ?? undefined }
    }
    const retriedDecision = decodeDecision(retried.intent.payload)
    if (!retriedDecision) return { accepted: false, reason: 'storage' }
    const projected = await projectStoredDecision(intentId, retriedDecision)
    if (!projected.accepted) return projected
    void publishPendingConfirmation(intentId)
    return { accepted: true, transactionId: retriedDecision.transaction.id }
  }

  const projected = await projectStoredDecision(intentId, stored)
  if (!projected.accepted) return projected
  if (isUnresolvedIntent(accepted.intent)) void publishPendingConfirmation(intentId)
  return { accepted: true, transactionId: stored.transaction.id }
}

/**
 * Re-projects every accepted confirmation and publishes whatever step the
 * queue does not own yet. Called at startup, on reconnection and after a
 * catalog/config confirmation; it never decides the financial values again.
 */
export async function resumePendingConfirmations(): Promise<void> {
  if (isReadOnlyDemoActive()) return
  const syncStore = useSyncStore()
  if (!syncStore.userId) return
  const views = await syncStore.listIntents()
  for (const view of views) {
    if (view.intent.kind !== PENDING_CONFIRMATION_KIND) continue
    if (view.intent.ownerUserId !== syncStore.userId) continue
    if (!isUnresolvedIntent(view.intent)) continue
    // A definitive failure or a discard waits for the user's explicit retry.
    if (view.intent.failure || view.intent.discardRequested) continue
    const decision = decodeDecision(view.intent.payload)
    if (!decision) continue
    const projected = await projectStoredDecision(view.intent.id, decision)
    if (!projected.accepted) continue
    await publishPendingConfirmation(view.intent.id)
  }
  await pruneSettledConfirmations()
}

/**
 * Forgets confirmations whose pending is already confirmed and linked in the
 * read model. Keeping them would only grow the queue database: the pending is
 * closed, so it can no longer enable a second movement. Unresolved, discarded
 * and partial reservations are kept on purpose.
 */
async function pruneSettledConfirmations(): Promise<void> {
  const syncStore = useSyncStore()
  const financialStore = useFinancialStateStore()
  const views = await syncStore.listIntents()
  for (const view of views) {
    if (view.intent.kind !== PENDING_CONFIRMATION_KIND) continue
    if (view.intent.state !== 'confirmed') continue
    const decision = decodeDecision(view.intent.payload)
    if (!decision) continue
    const pending = financialStore.state.pendingMovements.find(
      (item) => item.id === decision.pendingId,
    )
    if (!pending || pending.status !== 'confirmed') continue
    if (pending.transactionId !== decision.transaction.id) continue
    await syncStore.deleteIntent(view.intent.id)
  }
}

/**
 * Explicit retry of a failed or discarded confirmation: same reservation,
 * same movement id, new command attempts only for the steps that need one.
 */
export async function retryPendingConfirmation(
  pendingId: string,
): Promise<PendingConfirmationOutcome> {
  if (isReadOnlyDemoActive()) return { accepted: false, reason: 'not-found' }
  const syncStore = useSyncStore()
  if (!syncStore.userId) return { accepted: false, reason: 'not-found' }
  const intentId = pendingConfirmationIntentId(pendingId)
  const view = (await syncStore.listIntents()).find((item) => item.intent.id === intentId)
  if (!view) return { accepted: false, reason: 'not-found' }
  const decision = decodeDecision(view.intent.payload)
  if (!decision) return { accepted: false, reason: 'storage' }
  if (view.intent.discardRequested) {
    return {
      accepted: false,
      reason: 'reconciling',
      message: RECONCILING_MESSAGE,
    }
  }
  const retried = await syncStore.retryIntent(intentId)
  if (!retried)
    return { accepted: false, reason: 'storage', message: syncStore.lastError ?? undefined }
  const projected = await projectStoredDecision(intentId, decision)
  if (!projected.accepted) return projected
  void publishPendingConfirmation(intentId)
  return { accepted: true, transactionId: decision.transaction.id }
}

/**
 * Discards the cancellable remainder. A confirmed movement is never reverted:
 * the reservation is kept (so no second movement can be confirmed) and the
 * partial state is persisted for the status surface. An in-flight request is
 * reconciled first and reported as such.
 */
export async function discardPendingConfirmation(
  pendingId: string,
): Promise<PendingConfirmationDiscard> {
  if (isReadOnlyDemoActive()) return { discarded: true, keptMovement: false }
  const syncStore = useSyncStore()
  if (!syncStore.userId) return { discarded: true, keptMovement: false }
  const intentId = pendingConfirmationIntentId(pendingId)
  const view = (await syncStore.listIntents()).find((item) => item.intent.id === intentId)
  if (!view) return { discarded: true, keptMovement: false }
  const decision = decodeDecision(view.intent.payload)
  const result = await syncStore.discardIntent(intentId)
  if (!result) {
    return {
      discarded: false,
      keptMovement: false,
      message: syncStore.lastError ?? 'No se pudo descartar la confirmación.',
    }
  }
  if (!result.finalized) {
    return {
      discarded: false,
      keptMovement: result.kept > 0,
      message: RECONCILING_MESSAGE,
    }
  }
  if (result.kept > 0) {
    // The movement is confirmed: reverting it would be another financial
    // action, and reopening the pending would enable a second confirmation.
    // Keep the pending confirmed and linked to that movement (reconciling the
    // link in this projection) and surface the partial result.
    if (decision) reconcileConfirmedLink(decision)
    await syncStore.failIntent(intentId, PARTIAL_CONFIRMATION_MESSAGE)
    return { discarded: true, keptMovement: true, message: PARTIAL_CONFIRMATION_MESSAGE }
  }
  if (decision) revertProjection(decision)
  return { discarded: true, keptMovement: false }
}

/** The reservation state for one pending, or `null` when there is none. */
export async function pendingConfirmationStatus(
  pendingId: string,
): Promise<PendingConfirmationStatus | null> {
  if (isReadOnlyDemoActive()) return null
  const syncStore = useSyncStore()
  if (!syncStore.userId) return null
  const intentId = pendingConfirmationIntentId(pendingId)
  const view = (await syncStore.listIntents()).find((item) => item.intent.id === intentId)
  if (!view) return null
  const decision = decodeDecision(view.intent.payload)
  if (!decision) return null
  const movement = stepOf(view, MOVEMENT_STEP)
  const pending = stepOf(view, PENDING_STEP)
  return {
    pendingId,
    transactionId: decision.transaction.id,
    state: view.intent.state,
    movementQueued: movement?.state === 'queued' || movement?.state === 'sending',
    movementConfirmed: movement?.state === 'confirmed',
    pendingLinked: pending?.state === 'confirmed',
    waitingFor: view.intent.waitingFor,
    failure: view.intent.failure,
    discarded: view.intent.state === 'discarded',
  }
}

async function buildAcceptanceMovementCommand(
  request: PendingConfirmationRequest,
): Promise<OutboxCommandInput | null> {
  try {
    const data = await buildMovementData(request.transaction, useFinancialStateStore().currency)
    if (!data) return null
    return {
      action: 'create',
      entityType: 'transaction',
      data: { ...data, id: request.transaction.id },
    }
  } catch {
    // A reference that cannot be resolved keeps the reservation waiting; it is
    // never a reason to report the confirmation as failed.
    return null
  }
}

// -- projection ---------------------------------------------------------------

type ProjectionOutcome =
  | { accepted: true }
  | { accepted: false; reason: PendingConfirmationFailureReason; message?: string }

function projectDecision(decision: PendingConfirmationRequest): void {
  const financialStore = useFinancialStateStore()
  financialStore.commitState((draft) => {
    if (!draft.transactions.some((item) => item.id === decision.transaction.id)) {
      draft.transactions.push({ ...decision.transaction })
    }
    const current = draft.pendingMovements.find((item) => item.id === decision.pendingId)
    if (!current || current.status !== 'pending') return
    current.status = 'confirmed'
    current.transactionId = decision.transaction.id
    if (decision.edited) applyPendingEdit(current, decision.resolved, decision.pendingUpdatedAt)
    else current.updatedAt = decision.pendingUpdatedAt
  })
}

async function projectStoredDecision(
  intentId: string,
  decision: StoredDecision,
): Promise<ProjectionOutcome> {
  const financialStore = useFinancialStateStore()
  const projected: {
    failure: { reason: PendingConfirmationFailureReason; message: string } | null
  } = { failure: null }
  financialStore.commitState((draft) => {
    const current = draft.pendingMovements.find((item) => item.id === decision.pendingId)
    if (!current) {
      projected.failure = { reason: 'not-found', message: 'El pendiente ya no está disponible.' }
      return
    }
    if (current.status === 'confirmed') {
      if (current.transactionId && current.transactionId !== decision.transaction.id) {
        projected.failure = {
          reason: 'conflict',
          message: 'Este pendiente ya se confirmó con otro movimiento.',
        }
        return
      }
      // Already projected (a reload, a repeated call or the outbox overlay):
      // keep the accepted movement visible without touching the pending again.
      if (!draft.transactions.some((item) => item.id === decision.transaction.id)) {
        draft.transactions.push({ ...decision.transaction })
      }
      return
    }
    if (current.status !== 'pending') {
      projected.failure = { reason: 'conflict', message: 'El pendiente ya no está abierto.' }
      return
    }
    if (!draft.transactions.some((item) => item.id === decision.transaction.id)) {
      draft.transactions.push({ ...decision.transaction })
    }
    current.status = 'confirmed'
    current.transactionId = decision.transaction.id
    if (decision.edited) applyPendingEdit(current, decision.resolved, decision.pendingUpdatedAt)
    else current.updatedAt = decision.pendingUpdatedAt
  })
  if (projected.failure) {
    await useSyncStore().failIntent(intentId, projected.failure.message)
    return { accepted: false, ...projected.failure }
  }
  return { accepted: true }
}

/**
 * Reconciles the pending→movement relation without undoing either side: the
 * confirmed movement stays in the ledger and the pending keeps pointing at it,
 * so no surface can offer another confirmation for the same pending. If the
 * server later reports the pending still open, the durable reservation remains
 * the guard against a second movement (see `confirmPendingMovement`).
 */
function reconcileConfirmedLink(decision: StoredDecision): void {
  useFinancialStateStore().commitState((draft) => {
    if (!draft.transactions.some((item) => item.id === decision.transaction.id)) {
      draft.transactions.push({ ...decision.transaction })
    }
    const current = draft.pendingMovements.find((item) => item.id === decision.pendingId)
    if (!current) return
    current.status = 'confirmed'
    current.transactionId = decision.transaction.id
  })
}

function revertProjection(decision: StoredDecision): void {
  useFinancialStateStore().commitState((draft) => {
    draft.transactions = draft.transactions.filter((item) => item.id !== decision.transaction.id)
    const current = draft.pendingMovements.find((item) => item.id === decision.pendingId)
    if (!current) return
    if (current.status === 'confirmed' && current.transactionId === decision.transaction.id) {
      current.status = 'pending'
      current.transactionId = null
    }
  })
}

// -- publication --------------------------------------------------------------

async function publishPendingConfirmation(intentId: string): Promise<void> {
  const syncStore = useSyncStore()
  try {
    const view = (await syncStore.listIntents()).find((item) => item.intent.id === intentId)
    if (!view) return
    if (view.intent.kind !== PENDING_CONFIRMATION_KIND) return
    if (view.intent.ownerUserId !== syncStore.userId) return
    if (!isUnresolvedIntent(view.intent)) return
    if (view.intent.failure || view.intent.discardRequested) return
    const decision = decodeDecision(view.intent.payload)
    if (!decision) return
    const movement = stepOf(view, MOVEMENT_STEP)
    const pending = stepOf(view, PENDING_STEP)
    if (!movement || !pending) return
    if (movement.state === 'cancelled' || movement.state === 'failed') return

    // Movement first: the pending update must never reference a movement whose
    // command could not exist.
    if (movement.state === 'pending') {
      const data = await buildMovementData(decision.transaction, useFinancialStateStore().currency)
      if (!data) {
        await syncStore.markIntentWaiting(intentId, 'private-configuration')
        return
      }
      const [result] = await syncStore.publishMovementCommands([
        {
          movementId: decision.transaction.id,
          plan: { action: 'create', data: { ...data, id: decision.transaction.id } },
          origin: 'movement',
          type: decision.transaction.type,
          instrumentId: decision.transaction.instrumentId ?? null,
          fingerprint: movementFingerprint(decision.transaction),
          intent: { intentId, step: MOVEMENT_STEP },
        },
      ])
      if (!result || result.outcome === 'unresolved') {
        await syncStore.markIntentWaiting(intentId, 'private-configuration')
        return
      }
      if (result.outcome !== 'published') return
    }

    // The pending update references the movement row: wait for the server's
    // acknowledgement so a movement the server rejects can never leave a
    // dangling pending→movement link. This is the one extra round trip the
    // "movement before pending" guarantee costs.
    const afterMovement = (await syncStore.listIntents()).find(
      (item) => item.intent.id === intentId,
    )
    if (!afterMovement || stepOf(afterMovement, MOVEMENT_STEP)?.state !== 'confirmed') return
    if (pending.state !== 'pending') return
    const command = await buildPendingConfirmationCommand(decision)
    if (!command) {
      await syncStore.markIntentWaiting(intentId, 'private-configuration')
      return
    }
    await syncStore.publishIntentCommands(intentId, [{ step: PENDING_STEP, command }])
  } catch {
    // A transient failure leaves the reservation accepted: the next resume
    // retries with the same identity. Do not mark it failed here.
  }
}

async function buildPendingConfirmationCommand(
  decision: StoredDecision,
): Promise<OutboxCommandInput | null> {
  const syncStore = useSyncStore()
  // Without a confirmed (or at least queued) pending row there is nothing the
  // update can address yet; the reservation waits instead of inventing a link.
  const ref = await syncStore.getEntityRef('pendingMovement', decision.pendingId)
  if (!ref) return null
  const recurringRuleId = await resolveEntityId('recurringRule', decision.ruleId)
  if (!recurringRuleId) return null
  const accountId = await resolveEntityId('account', decision.resolved.accountId)
  if (!accountId) return null
  let destinationAccountId: string | null = null
  if (decision.resolved.type === 'saving') {
    if (!decision.resolved.destinationAccountId) return null
    destinationAccountId = await resolveEntityId('account', decision.resolved.destinationAccountId)
    if (!destinationAccountId) return null
  }
  const categoryId = await resolveOrCreateCategoryId(
    decision.resolved.type as CategoryKind,
    decision.resolved.category,
  )
  if (!categoryId) return null
  const transactionId = await resolveEntityId('transaction', decision.transaction.id)
  if (!transactionId) return null
  return {
    action: 'update',
    entityType: 'pendingMovement',
    entityId: ref.entityId,
    baseVersion: ref.version,
    patch: {
      recurringRuleId,
      accountId,
      destinationAccountId,
      categoryId,
      amount: decision.resolved.amount,
      currency: useFinancialStateStore().currency,
      dueDate: decision.resolved.occurrenceDate,
      type: decision.resolved.type,
      description: decision.resolved.description,
      ...operationData(decision.resolved),
      transactionId,
      status: 'confirmed',
    },
  }
}

// -- persist / restore the decided intent --------------------------------------

function encodeDecision(request: PendingConfirmationRequest): IntentPayload {
  const { resolved, transaction } = request
  return {
    pendingId: request.pendingId,
    ruleId: request.ruleId,
    transactionId: transaction.id,
    occurrenceDate: resolved.occurrenceDate,
    type: resolved.type,
    accountId: resolved.accountId,
    destinationAccountId: resolved.destinationAccountId ?? null,
    category: resolved.category,
    description: resolved.description,
    amount: resolved.amount,
    signedAmount: resolved.signedAmount,
    month: transaction.month,
    edited: request.edited,
    symbol: resolved.symbol ?? null,
    side: resolved.side ?? null,
    units: resolved.units ?? null,
    unitPrice: resolved.unitPrice ?? null,
    fee: resolved.fee ?? null,
    time: resolved.time ?? null,
    declared: Boolean(transaction.declared),
    movementCreatedAt: transaction.createdAt ?? new Date().toISOString(),
    pendingCreatedAt: request.pendingCreatedAt,
    pendingUpdatedAt: request.pendingUpdatedAt,
  }
}

function decodeDecision(payload: IntentPayload): StoredDecision | null {
  const pendingId = payloadText(payload, 'pendingId')
  const ruleId = payloadText(payload, 'ruleId')
  const transactionId = payloadText(payload, 'transactionId')
  const occurrenceDate = payloadText(payload, 'occurrenceDate')
  const type = payloadText(payload, 'type')
  const accountId = payloadText(payload, 'accountId')
  const category = payloadText(payload, 'category')
  const description = payloadText(payload, 'description')
  const amount = payloadNumber(payload, 'amount')
  const signedAmount = payloadNumber(payload, 'signedAmount')
  const month = payloadNumber(payload, 'month')
  const movementCreatedAt = payloadText(payload, 'movementCreatedAt')
  const pendingCreatedAt = payloadText(payload, 'pendingCreatedAt')
  const pendingUpdatedAt = payloadText(payload, 'pendingUpdatedAt')
  if (
    !pendingId ||
    !ruleId ||
    !transactionId ||
    !occurrenceDate ||
    !type ||
    !accountId ||
    !category ||
    description === null ||
    amount === null ||
    signedAmount === null ||
    month === null ||
    !movementCreatedAt ||
    !pendingCreatedAt ||
    !pendingUpdatedAt
  )
    return null
  const resolved: ResolvedPendingEdit = {
    type: type as ResolvedPendingEdit['type'],
    occurrenceDate,
    accountId,
    ...(payloadText(payload, 'destinationAccountId')
      ? { destinationAccountId: payloadText(payload, 'destinationAccountId')! }
      : {}),
    category,
    description,
    amount,
    signedAmount,
    ...(payloadText(payload, 'symbol') ? { symbol: payloadText(payload, 'symbol')! } : {}),
    ...(payloadText(payload, 'side') ? { side: payloadText(payload, 'side') as InvestmentSide } : {}),
    ...(payloadNumber(payload, 'units') !== null ? { units: payloadNumber(payload, 'units')! } : {}),
    ...(payloadNumber(payload, 'unitPrice') !== null ? { unitPrice: payloadNumber(payload, 'unitPrice')! } : {}),
    ...(payloadNumber(payload, 'fee') !== null ? { fee: payloadNumber(payload, 'fee')! } : {}),
    ...(payloadText(payload, 'time') ? { time: payloadText(payload, 'time')! } : {}),
  }
  const transaction: Transaction = {
    id: transactionId,
    date: occurrenceDate,
    month: month as Transaction['month'],
    type: resolved.type,
    accountId,
    ...(resolved.destinationAccountId
      ? { destinationAccountId: resolved.destinationAccountId }
      : {}),
    category,
    description,
    amount: signedAmount,
    ...(resolved.symbol ? { symbol: resolved.symbol } : {}),
    ...(resolved.side ? { side: resolved.side } : {}),
    ...(resolved.units !== undefined ? { units: resolved.units } : {}),
    ...(resolved.unitPrice !== undefined ? { unitPrice: resolved.unitPrice } : {}),
    ...(resolved.fee !== undefined ? { fee: resolved.fee } : {}),
    ...(resolved.time ? { time: resolved.time } : {}),
    declared: payload.declared === true,
    createdAt: movementCreatedAt,
  }
  return {
    pendingId,
    ruleId,
    resolved,
    transaction,
    edited: payload.edited === true,
    pendingCreatedAt,
    pendingUpdatedAt,
  }
}

function needsExplicitRetry(view: DurableIntentView): boolean {
  if (view.intent.discardRequested) return false
  return (
    view.intent.failure !== null ||
    view.steps.some((step) => step.state === 'failed' || step.state === 'cancelled')
  )
}

// -- intent actions shared with the sidebar -----------------------------------

/**
 * The intent kinds the recurring module owns. The sidebar's retry/discard
 * actions must route them here instead of the generic intent discard: a
 * partial confirmation keeps its confirmed movement, pending link and
 * reconciliation retry visible, and a rule write needs its own retry/discard
 * rules.
 */
export const isRecurringIntentKind = (kind: DurableIntentKind): boolean =>
  kind === PENDING_CONFIRMATION_KIND || kind === 'recurringRuleWrite'

/**
 * Runs one retry/discard action for a recurring intent, returning whether it
 * could be applied. The caller (shell/status surface) stays ignorant of the
 * kind-specific guarantees.
 */
export async function runRecurringIntentAction(
  intent: DurableIntentRecord,
  action: 'retry' | 'discard',
): Promise<boolean> {
  if (intent.kind === PENDING_CONFIRMATION_KIND) {
    const pendingId = payloadText(intent.payload, 'pendingId') ?? intent.targetIds[0] ?? null
    if (!pendingId) return false
    if (action === 'retry') return (await retryPendingConfirmation(pendingId)).accepted
    return (await discardPendingConfirmation(pendingId)).discarded
  }
  if (intent.kind === 'recurringRuleWrite') {
    const ruleId = payloadText(intent.payload, 'ruleId') ?? intent.targetIds[0] ?? null
    if (!ruleId) return false
    const { retryRecurringRuleWrites, discardRecurringRuleWrites } = await import(
      './recurring-rule-write'
    )
    if (action === 'retry') return (await retryRecurringRuleWrites(ruleId)).accepted
    return (await discardRecurringRuleWrites(ruleId)).discarded
  }
  return false
}
