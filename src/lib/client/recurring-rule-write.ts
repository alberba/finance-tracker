/**
 * Durable rule writes: creating, editing, pausing, deleting and refreshing a
 * recurring rule together with the pendings it generates (#493).
 *
 * The caller (the recurring store) makes the financial decisions — it builds
 * the accepted rule, runs the pure calendar generator and decides which
 * occurrences are new. This module receives that decision and hides the rest:
 * the durable order (rule, then the pendings that reference it, then the
 * calendar advance), reference resolution, retries and progress. The store no
 * longer owns closures, phase flags or a job queue.
 *
 * Ordering guarantees, all of them written to the same per-user queue database
 * in separate IndexedDB transactions so an interrupted save can be resumed:
 *
 * - The rule command is published before any pending command, and a pending's
 *   `recurringRuleId` is resolved from that queued create (its client id *is*
 *   the server id, ADR 0001) or from the confirmed row. No remote
 *   acknowledgement is awaited.
 * - Every pending command is durable in the outbox before the calendar step is
 *   published. A restart between phases resumes the stored intent, so the
 *   generator never has to guess whether an occurrence was already saved.
 * - Deleting a rule only publishes the rule `remove`: the server cascades its
 *   pendings, so queueing pending updates behind it would only produce
 *   `not_found` noise. Unresolved intents of the same rule are discarded first
 *   so no queued command can resurrect it.
 *
 * The intent payload keeps the decided rule, its accepted occurrences and the
 * pre/post-calendar values as JSON. It is the reconstructible record #487 asks
 * for, and it never stores an old copy of a movement.
 *
 * Boundary (ADR-0006): this module is invoked exclusively from Pinia actions,
 * the documented edge where promises are executed. The Effect-based storage
 * protocol stays in `durable-intents`/`outbox`; only the small vocabulary in
 * `recurring-intent-support.ts` is shared with the pending-confirmation module.
 */

import type { PendingMovement, RecurringRule, TransactionType } from '../../scripts/types'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useSyncStore } from '../../stores/sync'
import {
  resolveEntityId,
  resolveOrCreateCategoryId,
  syncUpdate,
  type CategoryKind,
} from './command-mapping'
import { isReadOnlyDemoActive } from './demo-source'
import {
  isUnresolvedIntent,
  type DurableIntentState,
  type IntentCommandInput,
  type IntentPayload,
  type IntentStepState,
  type IntentWaitReason,
} from './durable-intents'
import type { OutboxCommandInput } from './outbox'
import {
  RECONCILING_MESSAGE,
  isDurableStep,
  mintNonce,
  operationData,
  stepOf,
} from './recurring-intent-support'

const RECURRING_RULE_WRITE_KIND = 'recurringRuleWrite' as const

/** The rule command: create, update, remove, or absent on a pure refresh. */
const RULE_STEP = 'rule'
/** One step per occurrence: a pending command is published alone, atomically. */
const PENDING_STEP_PREFIX = 'pending:'
/** The calendar advance; published only after the pendings step is durable. */
const CALENDAR_STEP = 'calendar'

const INTENT_PREFIX = 'recurringRuleWrite:'

type RecurringRuleWriteAction = 'create' | 'update' | 'remove' | 'refresh'

/**
 * The user's already-decided recurring change. Nothing here validates money,
 * resolves references or generates occurrences.
 */
interface RecurringRuleWriteRequest {
  action: RecurringRuleWriteAction
  /** The accepted rule, with the calendar it had before generation. */
  rule: RecurringRule
  /** The occurrences this change generated, each with its own id. */
  pendings: readonly PendingMovement[]
  /**
   * The rule after `generatePendingMovements` advanced it, or `null` when the
   * calendar did not change. Its `lastExecutionDate` / `nextOccurrenceDate`
   * are the last durable step.
   */
  calendar: RecurringRule | null
}

export interface RecurringRuleWriteOutcome {
  accepted: boolean
  ruleId: string
  /** `null` when there was nothing left to write (a never-synced deletion). */
  intentId: string | null
  reason?: 'storage' | 'invalid'
  message?: string
}

/** The state the status surface renders, without phases, closures or retries. */
export interface RecurringRuleWriteStatus {
  ruleId: string
  intentId: string
  action: RecurringRuleWriteAction
  state: DurableIntentState
  waitingFor: IntentWaitReason | null
  failure: string | null
  discarded: boolean
  steps: Array<{ step: string; state: IntentStepState }>
}

interface PendingMovementWriteOutcome {
  accepted: boolean
}

interface RecurringRuleWriteDiscard {
  discarded: boolean
  /** Confirmed steps that were kept (a rule already created server-side). */
  kept: number
  message?: string
}

interface StoredRuleWrite {
  action: RecurringRuleWriteAction
  rule: RecurringRule
  pendings: PendingMovement[]
  calendar: RecurringRule | null
  currency: string
}

type PublicationOutcome = 'published' | 'skipped' | 'blocked' | 'failed' | 'completed'

const recurringRuleWriteIntentId = (ruleId: string, nonce: string): string =>
  `${INTENT_PREFIX}${ruleId}:${nonce}`

const ruleIdFromIntentId = (intentId: string): string | null => {
  if (!intentId.startsWith(INTENT_PREFIX)) return null
  const rest = intentId.slice(INTENT_PREFIX.length)
  const separator = rest.lastIndexOf(':')
  return separator <= 0 ? null : rest.slice(0, separator)
}

// -- public interface ---------------------------------------------------------

/**
 * Accepts a rule change: the intent (with the decided rule, its occurrences
 * and the calendar values) is durable before this resolves, then the module
 * publishes every step whose references can already be resolved. It never
 * waits for the server.
 */
export async function saveRecurringRule(
  request: RecurringRuleWriteRequest,
): Promise<RecurringRuleWriteOutcome> {
  const syncStore = useSyncStore()
  const ownerUserId = syncStore.userId
  if (isReadOnlyDemoActive() || !ownerUserId) {
    // No durable queue in demo/fixtures: the in-memory projection is the only
    // state, so the calendar is applied with the rest of the accepted change.
    projectWrite(request)
    if (request.calendar) applyCalendar(request)
    return { accepted: true, ruleId: request.rule.id, intentId: null }
  }

  const currency = useFinancialStateStore().currency
  const intentId = recurringRuleWriteIntentId(request.rule.id, mintNonce())
  const steps = stepsOf(request)
  // The rule command is built up front so the acceptance can publish it in the
  // same transaction (#490/#491): there is no accepted intent whose first
  // effect is not already durable. A reference that cannot be resolved yet
  // keeps the intent waiting instead of inventing a command.
  const ruleCommand =
    request.action === 'refresh' ? null : await buildRuleStepCommand(request, currency)
  const accepted = await syncStore.acceptIntent({
    id: intentId,
    kind: RECURRING_RULE_WRITE_KIND,
    ownerUserId,
    targetIds: [request.rule.id],
    steps,
    payload: encodeRequest(request, currency),
    ...(ruleCommand
      ? { commands: [{ step: RULE_STEP, command: ruleCommand }] }
      : request.action === 'refresh'
        ? {}
        : { waitingFor: 'private-configuration' as const }),
  })
  if (!accepted) {
    return {
      accepted: false,
      ruleId: request.rule.id,
      intentId: null,
      reason: 'storage',
      message: syncStore.lastError ?? undefined,
    }
  }
  if (accepted.intent.ownerUserId !== ownerUserId) {
    return {
      accepted: false,
      ruleId: request.rule.id,
      intentId: null,
      reason: 'storage',
      message: 'El cambio pertenece a otra sesión.',
    }
  }

  // The intent payload makes the decision reconstructible from the first
  // moment, so the optimistic projection is safe: a reload re-projects it.
  projectWrite(request)
  // The calendar only advances locally once its command exists (or is already
  // confirmed): an occurrence that is not durable yet must not look covered.
  await publishRuleWritesFor(request.rule.id)
  await projectFromIntent(intentId)
  return { accepted: true, ruleId: request.rule.id, intentId }
}

/**
 * Deletes a rule. The server cascades its pendings, so no pending update is
 * enqueued: only the rule `remove` is written, after discarding every
 * unresolved intent of the same rule so nothing can recreate it.
 */
export async function removeRecurringRule(
  rule: RecurringRule,
): Promise<RecurringRuleWriteOutcome> {
  const syncStore = useSyncStore()
  const ownerUserId = syncStore.userId
  if (isReadOnlyDemoActive() || !ownerUserId) {
    projectRemoval(rule.id)
    return { accepted: true, ruleId: rule.id, intentId: null }
  }

  const pendingWrites = (await syncStore.listIntents()).filter(
    (view) =>
      view.intent.kind === RECURRING_RULE_WRITE_KIND &&
      view.intent.ownerUserId === ownerUserId &&
      ruleIdFromIntentId(view.intent.id) === rule.id &&
      isUnresolvedIntent(view.intent),
  )
  for (const view of pendingWrites) await syncStore.discardIntent(view.intent.id)

  // Nothing was ever queued for this rule: the deletion has no durable work.
  const ref = await syncStore.getEntityRef('recurringRule', rule.id)
  const queued = ref
    ? null
    : await syncStore.peekPendingCreate('recurringRule', (data) => data.id === rule.id)
  if (!ref && !queued) {
    projectRemoval(rule.id)
    return { accepted: true, ruleId: rule.id, intentId: null }
  }

  const request: RecurringRuleWriteRequest = {
    action: 'remove',
    rule,
    pendings: [],
    calendar: null,
  }
  const intentId = recurringRuleWriteIntentId(rule.id, mintNonce())
  const ruleCommand = ref
    ? {
        action: 'remove' as const,
        entityType: 'recurringRule' as const,
        entityId: ref.entityId,
        baseVersion: ref.version,
      }
    : null
  const accepted = await syncStore.acceptIntent({
    id: intentId,
    kind: RECURRING_RULE_WRITE_KIND,
    ownerUserId,
    targetIds: [rule.id],
    steps: [RULE_STEP],
    payload: encodeRequest(request, useFinancialStateStore().currency),
    ...(ruleCommand
      ? { commands: [{ step: RULE_STEP, command: ruleCommand }] }
      : { waitingFor: 'private-configuration' as const }),
  })
  if (!accepted) {
    return {
      accepted: false,
      ruleId: rule.id,
      intentId: null,
      reason: 'storage',
      message: syncStore.lastError ?? undefined,
    }
  }
  projectRemoval(rule.id)
  await publishRuleWritesFor(rule.id)
  return { accepted: true, ruleId: rule.id, intentId }
}

/**
 * Persists one pending edit (or a skip/cancel): the pending command is built
 * here, with the same reference resolution as the rest of the module, and
 * folded into its still-queued create when it has not synced yet. There is no
 * dependent write, so no intent is needed; the outbox transaction is atomic.
 */
export async function savePendingMovement(
  pending: PendingMovement,
): Promise<PendingMovementWriteOutcome> {
  const syncStore = useSyncStore()
  if (isReadOnlyDemoActive() || !syncStore.userId) {
    projectPending(pending)
    return { accepted: true }
  }
  const ruleId = await resolveEntityId('recurringRule', pending.ruleId)
  if (!ruleId) return { accepted: false }
  const data = await buildPendingData(pending, useFinancialStateStore().currency, ruleId)
  if (!data) return { accepted: false }
  const saved = await syncUpdate('pendingMovement', pending.id, data)
  if (saved === false) return { accepted: false }
  projectPending(pending)
  return { accepted: true }
}

/**
 * Re-projects and publishes every accepted rule change that is still
 * unresolved. Called at startup, on reconnection and after a configuration
 * confirmation; it never decides the financial values again.
 */
export async function resumeRecurringRuleWrites(): Promise<void> {
  if (isReadOnlyDemoActive()) return
  const syncStore = useSyncStore()
  if (!syncStore.userId) return
  const ruleIds = new Set<string>()
  for (const view of await syncStore.listIntents()) {
    if (view.intent.kind !== RECURRING_RULE_WRITE_KIND) continue
    if (view.intent.ownerUserId !== syncStore.userId) continue
    if (!isUnresolvedIntent(view.intent)) continue
    const ruleId = ruleIdFromIntentId(view.intent.id)
    if (ruleId) ruleIds.add(ruleId)
  }
  for (const ruleId of ruleIds) await publishRuleWritesFor(ruleId)
  await pruneSettledRuleWrites()
}

/**
 * Publishes the accepted changes of one rule in acceptance order and stops at
 * the first one that is still unresolved. Publishing a newer edit before an
 * older one settles is what lets a late republish of the old command clobber
 * the accepted edit, so the barrier is the ordering guarantee, not an
 * optimisation.
 */
async function publishRuleWritesFor(ruleId: string): Promise<void> {
  const syncStore = useSyncStore()
  const views = (await syncStore.listIntents())
    .filter(
      (view) =>
        view.intent.kind === RECURRING_RULE_WRITE_KIND &&
        view.intent.ownerUserId === syncStore.userId &&
        ruleIdFromIntentId(view.intent.id) === ruleId,
    )
    .sort((left, right) => left.intent.createdAt.localeCompare(right.intent.createdAt))
  // The accepted edits are projected in acceptance order, newest last: a
  // change still waiting for an earlier one to settle is durable in its
  // intent and must be visible after a reload even though no command carries
  // it yet.
  for (const view of views) {
    if (!isUnresolvedIntent(view.intent)) continue
    if (view.intent.failure || view.intent.discardRequested) continue
    await projectFromIntent(view.intent.id)
  }
  for (const view of views) {
    if (!isUnresolvedIntent(view.intent)) continue
    // A definitive failure or an explicit discard is terminal for ordering:
    // the newer accepted change may proceed, and the failure keeps its retry.
    if (view.intent.failure || view.intent.discardRequested) continue
    await publishRuleWrite(view.intent.id)
    const after = (await syncStore.listIntents()).find(
      (item) => item.intent.id === view.intent.id,
    )
    if (!after) continue
    if (
      isUnresolvedIntent(after.intent) &&
      !after.intent.failure &&
      !after.intent.discardRequested
    ) {
      return
    }
  }
}

/**
 * Explicit retry of every failed or discarded rule change for one rule, in
 * acceptance order: the same rule/pending identities, new command attempts
 * only for the steps that need one.
 */
export async function retryRecurringRuleWrites(ruleId: string): Promise<RecurringRuleWriteOutcome> {
  const syncStore = useSyncStore()
  if (isReadOnlyDemoActive() || !syncStore.userId) {
    return { accepted: false, ruleId, intentId: null, reason: 'invalid' }
  }
  const views = (await syncStore.listIntents())
    .filter(
      (view) =>
        view.intent.kind === RECURRING_RULE_WRITE_KIND &&
        view.intent.ownerUserId === syncStore.userId &&
        ruleIdFromIntentId(view.intent.id) === ruleId,
    )
    .sort((left, right) => left.intent.createdAt.localeCompare(right.intent.createdAt))
  if (views.length === 0) {
    return { accepted: false, ruleId, intentId: null, reason: 'invalid' }
  }
  let lastIntentId: string | null = null
  for (const view of views) {
    if (view.intent.discardRequested) continue
    const retried = await syncStore.retryIntent(view.intent.id)
    if (!retried) {
      return {
        accepted: false,
        ruleId,
        intentId: view.intent.id,
        reason: 'storage',
        message: syncStore.lastError ?? undefined,
      }
    }
    lastIntentId = view.intent.id
  }
  await publishRuleWritesFor(ruleId)
  return { accepted: true, ruleId, intentId: lastIntentId }
}

/**
 * Discards the cancellable remainder of a rule change. Confirmed effects are
 * kept (a rule already created server-side, occurrences already saved); the
 * record stays visible as `partial` when only part of it landed. Cancelling
 * the whole remaining change never reverts a confirmed entity.
 */
export async function discardRecurringRuleWrites(
  ruleId: string,
): Promise<RecurringRuleWriteDiscard> {
  const syncStore = useSyncStore()
  if (isReadOnlyDemoActive() || !syncStore.userId) return { discarded: true, kept: 0 }
  const views = (await syncStore.listIntents()).filter(
    (view) =>
      view.intent.kind === RECURRING_RULE_WRITE_KIND &&
      view.intent.ownerUserId === syncStore.userId &&
      ruleIdFromIntentId(view.intent.id) === ruleId &&
      isUnresolvedIntent(view.intent),
  )
  let kept = 0
  let reconciling = false
  for (const view of views) {
    const result = await syncStore.discardIntent(view.intent.id)
    if (!result) {
      return {
        discarded: false,
        kept,
        message: syncStore.lastError ?? 'No se pudo descartar el cambio.',
      }
    }
    kept += result.kept
    if (!result.finalized) reconciling = true
  }
  if (reconciling) {
    return {
      discarded: false,
      kept,
      message: RECONCILING_MESSAGE,
    }
  }
  // A create that never reached the queue must disappear from the optimistic
  // projection; a confirmed entity is never reverted.
  for (const view of views) {
    const stored = decodeRequest(view.intent.payload)
    if (!stored || stored.action !== 'create') continue
    const ruleStep = stepOf(view, RULE_STEP)
    if (ruleStep?.state === 'confirmed') continue
    projectDiscardOfCreate(stored.rule.id, stored.pendings)
  }
  return { discarded: true, kept }
}

/** The unresolved writes of one rule (or of every rule), as the status surface needs. */
export async function recurringRuleWriteStatuses(
  ruleId?: string,
): Promise<RecurringRuleWriteStatus[]> {
  const syncStore = useSyncStore()
  if (isReadOnlyDemoActive() || !syncStore.userId) return []
  return (await syncStore.listIntents())
    .filter(
      (view) =>
        view.intent.kind === RECURRING_RULE_WRITE_KIND &&
        view.intent.ownerUserId === syncStore.userId &&
        (ruleId === undefined || ruleIdFromIntentId(view.intent.id) === ruleId),
    )
    .map((view) => {
      const stored = decodeRequest(view.intent.payload)
      return {
        ruleId: ruleIdFromIntentId(view.intent.id) ?? '',
        intentId: view.intent.id,
        action: stored?.action ?? 'update',
        state: view.intent.state,
        waitingFor: view.intent.waitingFor,
        failure: view.intent.failure,
        discarded: view.intent.state === 'discarded',
        steps: view.steps.map((step) => ({ step: step.step, state: step.state })),
      }
    })
}

// -- steps --------------------------------------------------------------------

function stepsOf(request: RecurringRuleWriteRequest): string[] {
  const steps: string[] = []
  if (request.action !== 'refresh') steps.push(RULE_STEP)
  for (const pending of request.pendings) steps.push(pendingStep(pending.id))
  if (request.calendar && calendarChanged(request.rule, request.calendar)) steps.push(CALENDAR_STEP)
  return steps
}

const pendingStep = (pendingId: string): string => `${PENDING_STEP_PREFIX}${pendingId}`

function calendarChanged(rule: RecurringRule, calendar: RecurringRule): boolean {
  return (
    rule.lastExecutionDate !== calendar.lastExecutionDate ||
    rule.nextOccurrenceDate !== calendar.nextOccurrenceDate
  )
}

/**
 * Publishes whatever step is ready, oldest intent first. Each publication is
 * a separate transaction (so a crash between phases is resumable), and a step
 * only becomes publishable when the one before it is durable.
 */
async function publishRuleWrite(intentId: string): Promise<void> {
  for (let round = 0; round < 8; round += 1) {
    const view = (await useSyncStore().listIntents()).find((item) => item.intent.id === intentId)
    if (!view) return
    if (view.intent.kind !== RECURRING_RULE_WRITE_KIND) return
    if (view.intent.ownerUserId !== useSyncStore().userId) return
    if (!isUnresolvedIntent(view.intent)) {
      await pruneRuleWrite(intentId)
      return
    }
    if (view.intent.failure || view.intent.discardRequested) return
    const stored = decodeRequest(view.intent.payload)
    if (!stored) {
      await useSyncStore().failIntent(intentId, 'No se pudo leer el cambio guardado.')
      return
    }
    const ruleStep = stepOf(view, RULE_STEP)
    const pendingSteps = view.steps.filter((step) => step.step.startsWith(PENDING_STEP_PREFIX))
    const calendarStep = stepOf(view, CALENDAR_STEP)

    if (ruleStep?.state === 'pending') {
      const outcome = await publishRuleStep(intentId, stored)
      if (await settleOutcome(intentId, outcome)) continue
      return
    }
    if (ruleStep && !isDurableStep(ruleStep)) return

    const nextPending = pendingSteps.find((step) => step.state === 'pending')
    if (nextPending) {
      const outcome = await publishPendingStep(
        intentId,
        stored,
        nextPending.step.slice(PENDING_STEP_PREFIX.length),
      )
      if (await settleOutcome(intentId, outcome)) {
        await projectFromIntent(intentId)
        continue
      }
      return
    }
    if (pendingSteps.some((step) => !isDurableStep(step))) return

    if (calendarStep?.state === 'pending') {
      const outcome = await publishCalendarStep(intentId, stored)
      if (await settleOutcome(intentId, outcome)) {
        await projectFromIntent(intentId)
        continue
      }
      return
    }

    await projectFromIntent(intentId)
    return
  }
}

/** Returns true when the publisher may go on to the next step. */
async function settleOutcome(intentId: string, outcome: PublicationOutcome): Promise<boolean> {
  switch (outcome) {
    case 'published':
    case 'completed':
      return true
    case 'skipped':
      // Another tab advanced this step first: re-read the record instead of
      // publishing a second command for the same effect.
      return true
    case 'blocked':
      await useSyncStore().markIntentWaiting(intentId, 'private-configuration')
      return false
    case 'failed':
      return false
  }
}

async function publishRuleStep(
  intentId: string,
  stored: StoredRuleWrite,
): Promise<PublicationOutcome> {
  if (stored.action === 'refresh') return 'completed'
  if (stored.action === 'remove') return publishRuleRemoval(intentId, stored)
  const data = await buildRuleData(stored)
  if (!data) return 'blocked'
  if (stored.action === 'create') {
    return publishCommands(intentId, [
      {
        step: RULE_STEP,
        command: {
          action: 'create',
          entityType: 'recurringRule',
          data: { ...data, id: stored.rule.id },
        },
      },
    ])
  }
  const target = await resolveRuleTarget(stored.rule.id)
  if (!target) return (await discardIfRuleGone(intentId, stored)) ? 'completed' : 'blocked'
  return publishCommands(intentId, [
    {
      step: RULE_STEP,
      command: {
        action: 'update',
        entityType: 'recurringRule',
        entityId: target.entityId,
        baseVersion: target.version,
        patch: data,
      },
    },
  ])
}

/**
 * A removal addresses the confirmed row. If the rule never synced, the queued
 * create is cancelled instead (the entity never existed server-side), and if
 * the create is already in flight the removal waits for its acknowledgement:
 * a `remove` addressed at a row that does not exist yet would be `not_found`.
 */
async function publishRuleRemoval(
  intentId: string,
  stored: StoredRuleWrite,
): Promise<PublicationOutcome> {
  const syncStore = useSyncStore()
  const ref = await syncStore.getEntityRef('recurringRule', stored.rule.id)
  if (ref) {
    return publishCommands(intentId, [
      {
        step: RULE_STEP,
        command: {
          action: 'remove',
          entityType: 'recurringRule',
          entityId: ref.entityId,
          baseVersion: ref.version,
        },
      },
    ])
  }
  const queued = await syncStore.peekPendingCreate(
    'recurringRule',
    (data) => data.id === stored.rule.id,
  )
  if (queued) {
    if (queued.attempts > 0) return 'blocked'
    await syncStore.cancelPendingCreate('recurringRule', (data) => data.id === stored.rule.id)
    await syncStore.completeIntentStep(intentId, RULE_STEP)
    return 'completed'
  }
  if (!ruleInState(stored.rule.id)) {
    await syncStore.completeIntentStep(intentId, RULE_STEP)
    return 'completed'
  }
  return 'blocked'
}

async function publishPendingStep(
  intentId: string,
  stored: StoredRuleWrite,
  pendingId: string,
): Promise<PublicationOutcome> {
  const pending = stored.pendings.find((item) => item.id === pendingId)
  if (!pending) {
    await useSyncStore().cancelIntentStep(intentId, pendingStep(pendingId))
    return 'completed'
  }
  const step = pendingStep(pendingId)
  const ruleId = await resolveEntityId('recurringRule', stored.rule.id)
  if (!ruleId) return (await discardIfRuleGone(intentId, stored)) ? 'completed' : 'blocked'
  // This device already shows the occurrence: no command is needed for it.
  if (pendingAlreadyShown(pending)) {
    await useSyncStore().completeIntentStep(intentId, step)
    return 'completed'
  }
  const data = await buildPendingData(pending, stored.currency, ruleId)
  if (!data) return 'blocked'
  return publishCommands(intentId, [
    {
      step,
      command: {
        action: 'create',
        entityType: 'pendingMovement',
        data: { ...data, id: pending.id },
      },
      // The cross-tab "one pending per rule+dueDate" invariant is enforced in
      // the publication transaction itself (#493): a read before it could let
      // two tabs queue the same occurrence.
      occurrence: { ruleId, dueDate: pending.occurrenceDate },
    },
  ])
}

/**
 * The calendar update stays behind every pending command by construction. A
 * still-queued rule create is addressed by its client id with `baseVersion: 0`
 * (ADR 0003 rebases it over the server's version on conflict); a confirmed
 * rule is addressed by its cached row and version.
 */
async function publishCalendarStep(
  intentId: string,
  stored: StoredRuleWrite,
): Promise<PublicationOutcome> {
  if (!stored.calendar) {
    await useSyncStore().completeIntentStep(intentId, CALENDAR_STEP)
    return 'completed'
  }
  const target = await resolveRuleTarget(stored.rule.id)
  if (!target) return (await discardIfRuleGone(intentId, stored)) ? 'completed' : 'blocked'
  const patch = {
    lastExecutionDate: stored.calendar.lastExecutionDate,
    nextRunDate: stored.calendar.nextOccurrenceDate,
  }
  return publishCommands(intentId, [
    {
      step: CALENDAR_STEP,
      command: {
        action: 'update',
        entityType: 'recurringRule',
        entityId: target.entityId,
        baseVersion: target.version,
        patch,
      },
    },
  ])
}

async function publishCommands(
  intentId: string,
  commands: Array<{ step: string; command: OutboxCommandInput; occurrence?: IntentOccurrence }>,
): Promise<PublicationOutcome> {
  const result = await useSyncStore().publishIntentCommands(intentId, commands)
  if (!result) return 'failed'
  if (result.published.length > 0) return 'published'
  // The step was already advanced (another tab) or blocked (failed/discarded).
  return 'skipped'
}

async function resolveRuleTarget(
  ruleId: string,
): Promise<{ entityId: string; version: number } | null> {
  const syncStore = useSyncStore()
  const ref = await syncStore.getEntityRef('recurringRule', ruleId)
  if (ref) return ref
  // The create is queued but not acknowledged yet. Its client id is the row's
  // primary key (ADR 0001) and the outbox is FIFO, so an update addressed at
  // it only reaches the server after the create; a stale baseVersion is a
  // conflict the sync store rebases (ADR 0003).
  const resolvable = await resolveEntityId('recurringRule', ruleId)
  return resolvable ? { entityId: resolvable, version: 0 } : null
}

/**
 * An update/refresh intent whose rule no longer exists anywhere (removed from
 * the projection, no queued create and no confirmed row) has nothing left to
 * do; its remaining steps are cancelled instead of waiting forever.
 */
async function discardIfRuleGone(intentId: string, stored: StoredRuleWrite): Promise<boolean> {
  if (stored.action === 'create' || stored.action === 'remove') return false
  if (ruleInState(stored.rule.id)) return false
  if (await resolveEntityId('recurringRule', stored.rule.id)) return false
  await useSyncStore().discardIntent(intentId)
  return true
}

/**
 * The rule command the acceptance publishes in its own transaction. A create
 * carries the client id; an edit of a still-queued create is addressed at the
 * same id with `baseVersion: 0` (FIFO puts the create first and ADR 0003
 * rebases the stale version); a confirmed rule is addressed at its cached row.
 */
async function buildRuleStepCommand(
  request: RecurringRuleWriteRequest,
  currency: string,
): Promise<OutboxCommandInput | null> {
  if (request.action === 'refresh' || request.action === 'remove') return null
  const data = await buildRuleData({
    action: request.action,
    rule: request.rule,
    pendings: [...request.pendings],
    calendar: request.calendar,
    currency,
  })
  if (!data) return null
  if (request.action === 'create') {
    return {
      action: 'create',
      entityType: 'recurringRule',
      data: { ...data, id: request.rule.id },
    }
  }
  const syncStore = useSyncStore()
  const ref = await syncStore.getEntityRef('recurringRule', request.rule.id)
  if (ref) {
    return {
      action: 'update',
      entityType: 'recurringRule',
      entityId: ref.entityId,
      baseVersion: ref.version,
      patch: data,
    }
  }
  const resolvable = await resolveEntityId('recurringRule', request.rule.id)
  if (!resolvable) return null
  return {
    action: 'update',
    entityType: 'recurringRule',
    entityId: resolvable,
    baseVersion: 0,
    patch: data,
  }
}

async function buildRuleData(stored: StoredRuleWrite): Promise<Record<string, unknown> | null> {
  const rule = stored.rule
  const accountId = await resolveEntityId('account', rule.accountId)
  if (!accountId) return null
  const destinationAccountId = await resolveDestination(rule)
  if (destinationAccountId === undefined) return null
  const categoryId = await resolveOrCreateCategoryId(rule.type as CategoryKind, rule.category)
  if (!categoryId) return null
  return {
    name: rule.description,
    type: rule.type,
    accountId,
    destinationAccountId,
    categoryId,
    amount: rule.amount,
    currency: stored.currency,
    frequency: rule.frequency,
    interval: rule.interval,
    startDate: rule.startDate,
    endDate: rule.endDate,
    lastExecutionDate: rule.lastExecutionDate,
    nextRunDate: rule.nextOccurrenceDate,
    ...operationData(rule),
    status: rule.active ? 'active' : 'paused',
  }
}

async function buildPendingData(
  pending: PendingMovement,
  currency: string,
  recurringRuleId: string,
): Promise<Record<string, unknown> | null> {
  const accountId = await resolveEntityId('account', pending.accountId)
  if (!accountId) return null
  const destinationAccountId = await resolveDestination(pending)
  if (destinationAccountId === undefined) return null
  const categoryId = await resolveOrCreateCategoryId(
    pending.type as CategoryKind,
    pending.category,
  )
  if (!categoryId) return null
  const transactionId = pending.transactionId
    ? await resolveEntityId('transaction', pending.transactionId)
    : null
  if (pending.transactionId && !transactionId) return null
  return {
    recurringRuleId,
    accountId,
    destinationAccountId,
    categoryId,
    amount: pending.amount,
    currency,
    dueDate: pending.occurrenceDate,
    type: pending.type,
    description: pending.description,
    ...operationData(pending),
    transactionId,
    status: pending.status,
  }
}

/**
 * The server id of a saving's destination, `null` when the template is not a
 * saving (clears a stale one) and `undefined` when it is a saving whose
 * destination cannot be resolved yet, so the caller skips the command.
 */
async function resolveDestination(template: {
  type: TransactionType
  destinationAccountId?: string
}): Promise<string | null | undefined> {
  if (template.type !== 'saving') return null
  if (!template.destinationAccountId) return undefined
  return (await resolveEntityId('account', template.destinationAccountId)) ?? undefined
}

// -- projection ----------------------------------------------------------------

function projectWrite(request: RecurringRuleWriteRequest): void {
  useFinancialStateStore().commitState((draft) => {
    if (request.action === 'remove') {
      applyRemoval(draft, request.rule.id)
      return
    }
    const existing = draft.recurringRules.find((rule) => rule.id === request.rule.id)
    if (existing) {
      if (request.action !== 'refresh') Object.assign(existing, request.rule)
    } else if (request.action === 'create') {
      draft.recurringRules.push({ ...request.rule })
    }
    for (const pending of request.pendings) addPending(draft, pending)
  })
}

async function projectFromIntent(intentId: string): Promise<void> {
  const syncStore = useSyncStore()
  const view = (await syncStore.listIntents()).find((item) => item.intent.id === intentId)
  if (!view || view.intent.kind !== RECURRING_RULE_WRITE_KIND) return
  const stored = decodeRequest(view.intent.payload)
  if (!stored) return
  const ruleStep = stepOf(view, RULE_STEP)
  const calendarStep = stepOf(view, CALENDAR_STEP)
  useFinancialStateStore().commitState((draft) => {
    if (stored.action === 'remove') {
      applyRemoval(draft, stored.rule.id)
      return
    }
    const existing = draft.recurringRules.find((rule) => rule.id === stored.rule.id)
    // A queued/confirmed rule command already carries this state (the read
    // model overlay applied it); a still-pending step exists only in the
    // intent, which is the reconstructible record of the accepted edit.
    if (existing && stored.action !== 'refresh' && !(ruleStep && isDurableStep(ruleStep))) {
      Object.assign(existing, stored.rule)
    }
    for (const pending of stored.pendings) addPending(draft, pending)
    if (stored.calendar && calendarStep && isDurableStep(calendarStep)) {
      const rule = draft.recurringRules.find((item) => item.id === stored.rule.id)
      if (rule) {
        rule.lastExecutionDate = stored.calendar.lastExecutionDate
        rule.nextOccurrenceDate = stored.calendar.nextOccurrenceDate
      }
    }
  })
}

function applyCalendar(request: RecurringRuleWriteRequest): void {
  if (!request.calendar) return
  useFinancialStateStore().commitState((draft) => {
    const rule = draft.recurringRules.find((item) => item.id === request.rule.id)
    if (!rule) return
    rule.lastExecutionDate = request.calendar!.lastExecutionDate
    rule.nextOccurrenceDate = request.calendar!.nextOccurrenceDate
  })
}

function applyRemoval(draft: { recurringRules: RecurringRule[]; pendingMovements: PendingMovement[] }, ruleId: string): void {
  draft.recurringRules = draft.recurringRules.filter((rule) => rule.id !== ruleId)
  const now = new Date().toISOString()
  draft.pendingMovements = draft.pendingMovements.map((pending) =>
    pending.ruleId === ruleId && pending.status === 'pending'
      ? { ...pending, status: 'cancelled', updatedAt: now }
      : pending,
  )
}

function projectPending(pending: PendingMovement): void {
  useFinancialStateStore().commitState((draft) => {
    const current = draft.pendingMovements.find((item) => item.id === pending.id)
    if (current) Object.assign(current, pending)
  })
}

function projectRemoval(ruleId: string): void {
  useFinancialStateStore().commitState((draft) => applyRemoval(draft, ruleId))
}

function projectDiscardOfCreate(ruleId: string, pendings: readonly PendingMovement[]): void {
  const pendingIds = new Set(pendings.map((pending) => pending.id))
  useFinancialStateStore().commitState((draft) => {
    draft.recurringRules = draft.recurringRules.filter((rule) => rule.id !== ruleId)
    draft.pendingMovements = draft.pendingMovements.filter(
      (pending) => pending.ruleId !== ruleId || !pendingIds.has(pending.id),
    )
  })
}

/**
 * Adds one accepted occurrence unless the same identity is already shown. Two
 * tabs that generated the same occurrence agree on its `occurrenceKey`, so
 * the projection never turns two ids into two occurrences.
 */
function addPending(
  draft: { pendingMovements: PendingMovement[] },
  pending: PendingMovement,
): void {
  if (draft.pendingMovements.some((item) => item.id === pending.id)) return
  if (draft.pendingMovements.some((item) => item.occurrenceKey === pending.occurrenceKey)) return
  draft.pendingMovements.push({ ...pending })
}

function pendingAlreadyShown(pending: PendingMovement): boolean {
  return useFinancialStateStore().state.pendingMovements.some(
    (item) => item.id !== pending.id && item.occurrenceKey === pending.occurrenceKey,
  )
}

function ruleInState(ruleId: string): boolean {
  return useFinancialStateStore().state.recurringRules.some((rule) => rule.id === ruleId)
}

type IntentOccurrence = NonNullable<IntentCommandInput['occurrence']>

// -- persistence --------------------------------------------------------------

function encodeRequest(request: RecurringRuleWriteRequest, currency: string): IntentPayload {
  const stored: StoredRuleWrite = {
    action: request.action,
    rule: request.rule,
    pendings: [...request.pendings],
    calendar: request.calendar,
    currency,
  }
  return {
    ruleId: request.rule.id,
    action: request.action,
    data: JSON.stringify(stored),
  }
}

function decodeRequest(payload: IntentPayload): StoredRuleWrite | null {
  const raw = payload.data
  if (typeof raw !== 'string' || !raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredRuleWrite> | null
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.action !== 'string' || !isAction(parsed.action)) return null
    if (!isRule(parsed.rule)) return null
    const pendings = Array.isArray(parsed.pendings)
      ? parsed.pendings.filter(isPending)
      : []
    return {
      action: parsed.action,
      rule: parsed.rule,
      pendings,
      calendar: isRule(parsed.calendar) ? parsed.calendar : null,
      currency: typeof parsed.currency === 'string' && parsed.currency ? parsed.currency : 'EUR',
    }
  } catch {
    return null
  }
}

function isAction(value: string): value is RecurringRuleWriteAction {
  return value === 'create' || value === 'update' || value === 'remove' || value === 'refresh'
}

function isRule(value: unknown): value is RecurringRule {
  if (!value || typeof value !== 'object') return false
  const rule = value as Partial<RecurringRule>
  return typeof rule.id === 'string' && rule.id.length > 0 && typeof rule.type === 'string'
}

function isPending(value: unknown): value is PendingMovement {
  if (!value || typeof value !== 'object') return false
  const pending = value as Partial<PendingMovement>
  return (
    typeof pending.id === 'string' &&
    pending.id.length > 0 &&
    typeof pending.occurrenceDate === 'string' &&
    typeof pending.occurrenceKey === 'string' &&
    typeof pending.ruleId === 'string'
  )
}

async function pruneSettledRuleWrites(): Promise<void> {
  const syncStore = useSyncStore()
  for (const view of await syncStore.listIntents()) {
    if (view.intent.kind !== RECURRING_RULE_WRITE_KIND) continue
    await pruneRuleWrite(view.intent.id)
  }
}

/**
 * Forgets a settled intent once its effects are durable. A confirmed create
 * cannot be duplicated by repeating it (the client id is the row's primary
 * key) and no queued command references the record any more.
 */
async function pruneRuleWrite(intentId: string): Promise<void> {
  const view = (await useSyncStore().listIntents()).find((item) => item.intent.id === intentId)
  if (!view || !isUnresolvedIntent(view.intent)) return
  if (view.steps.every((step) => step.state === 'confirmed' || step.state === 'cancelled')) {
    await useSyncStore().deleteIntent(intentId)
  }
}

