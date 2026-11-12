import { defineStore } from 'pinia'

import { computed, watch } from 'vue'

import { useToast } from '../composables/useToast'
import {
  applyPendingEdit,
  buildPendingTransaction,
  confirmFieldsFromPending,
  isValidSaving,
  resolvePendingEdit,
  type PendingMovementEdit,
} from '../domain/recurring/pending'
import { generatePendingMovements } from '../domain/recurring/pending'
import { nextOccurrenceDate, todayISO } from '../domain/recurring/occurrences'
import {
  resolveOrCreateCategoryId,
  resolveEntityId,
  syncListDiff,
  type CategoryKind,
} from '../lib/client/command-mapping'
import {
  confirmPendingMovement as confirmPendingMovementWrite,
  discardPendingConfirmation,
  pendingConfirmationStatus as readPendingConfirmationStatus,
  retryPendingConfirmation,
  type PendingConfirmationOutcome,
  type PendingConfirmationStatus,
} from '../lib/client/recurring-write'
import type {
  InvestmentSide,
  PendingMovement,
  RecurringFrequency,
  RecurringRule,
  TransactionType,
} from '../scripts/types'
import { round2, uid } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'
import { useStockEventsStore } from './stockevents'
import { useSyncStore } from './sync'

/**
 * WP7b — maps a legacy `RecurringRule` row to a `recurringRule` sync
 * command payload.
 *
 * WP10 fix: `accountId` is a *required* field on `entityCreateSchemas`
 * for every entity type below (`transaction`, `subscription`,
 * `recurringRule`, `pendingMovement`) — WP7b's original builders passed
 * the legacy row's `accountId` straight through unresolved, i.e. the
 * client-local id (`uid('acc')`), never the server-assigned account UUID
 * `resolveEntityId('account', …)` would return. Every real `/api/sync`
 * `create` command for these four entity types was therefore rejected
 * server-side (either the raw SQLite FK constraint, or WP10's stricter
 * `assertOwnedReferences` ownership guard, both correctly reject an
 * unresolved id) — undetected until this WP's E2E offline-sync spec
 * exercised a real create-account-then-create-transaction flow end to
 * end; every existing unit/command-mapping test mocked `getEntityRef`
 * directly rather than going through a real account-creation round trip.
 * Same "required FK, skip until resolved" pattern as `recurringRuleId`
 * below.
 */
async function buildRecurringRuleData(rule: RecurringRule, currency: string) {
  const accountId = await resolveEntityId('account', rule.accountId)
  if (!accountId) {
    return null
  }
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
    currency,
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

/**
 * The server id of a saving's destination account, `null` when the template is not a saving
 * (clears a stale one) and `undefined` when it is a saving whose destination cannot be resolved
 * yet, so the caller skips the command.
 */
async function resolveDestination(template: {
  type: TransactionType
  destinationAccountId?: string
}): Promise<string | null | undefined> {
  if (template.type !== 'saving') return null
  if (!template.destinationAccountId) return undefined
  return (await resolveEntityId('account', template.destinationAccountId)) ?? undefined
}

/**
 * The operation of an investment template, flattened into the command
 * payload. Sent as explicit `null`s rather than omitted so turning an
 * investment rule into an expense clears the columns instead of leaving
 * yesterday's symbol behind.
 */
function operationData(template: {
  symbol?: string
  side?: InvestmentSide
  units?: number
  unitPrice?: number
  fee?: number
  time?: string
}) {
  return {
    symbol: template.symbol ?? null,
    side: template.side ?? null,
    units: template.units ?? null,
    unitPrice: template.unitPrice ?? null,
    fee: template.fee ?? null,
    time: template.time ?? null,
  }
}

/**
 * WP7b — maps a legacy `PendingMovement` row to a `pendingMovement` sync
 * command payload. Returns `null` (skip, see `syncListDiff`) when either
 * required reference has not been enqueued. Both `recurringRuleId` and
 * `accountId` are required fields in `entityCreateSchemas.pendingMovement`
 * (see the WP10 fix note on `buildRecurringRuleData` above for `accountId`).
 */
async function buildPendingMovementData(pending: PendingMovement, currency: string) {
  const recurringRuleId = await resolveEntityId('recurringRule', pending.ruleId)
  if (!recurringRuleId) {
    return null
  }
  const accountId = await resolveEntityId('account', pending.accountId)
  if (!accountId) {
    return null
  }
  const destinationAccountId = await resolveDestination(pending)
  if (destinationAccountId === undefined) return null
  const categoryId = await resolveOrCreateCategoryId(pending.type as CategoryKind, pending.category)
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

export interface NewRecurringRuleInput {
  type: TransactionType
  accountId: string
  destinationAccountId?: string
  category: string
  description: string
  amount: number
  symbol?: string
  side?: 'buy' | 'sell'
  units?: number
  unitPrice?: number
  fee?: number
  time?: string
  frequency: RecurringFrequency
  interval: number
  startDate: string
  endDate?: string
}

export const useRecurringStore = defineStore('recurring', () => {
  const financialStateStore = useFinancialStateStore()
  const stockEventsStore = useStockEventsStore()
  const { showToast } = useToast()
  const rules = computed(() => financialStateStore.state.recurringRules)
  const pendingMovements = computed(() => financialStateStore.state.pendingMovements)
  const openPendingMovements = computed(() =>
    pendingMovements.value.filter((item) => item.status === 'pending'),
  )
  const pendingCount = computed(() => openPendingMovements.value.length)
  const syncStore = useSyncStore()
  const syncJobs: Array<{ work: () => Promise<boolean | void>; message?: string }> = []
  let enqueuing: Promise<void> | null = null
  let retryRequested = false

  // These jobs only retain changes still awaiting a durable enqueue. Hydration
  // and remote refreshes are never compared with a second copy of the model.
  function drainSyncJobs(): Promise<void> {
    if (enqueuing) {
      retryRequested = true
      return enqueuing
    }
    enqueuing = (async () => {
      while (syncJobs.length) {
        const job = syncJobs[0]
        try {
          if ((await job.work()) === false) throw new Error('El cambio no se ha encolado.')
        } catch {
          showToast(
            '⚠️ El cambio aún no está guardado. Se reintentará al reconectar o actualizar pendientes.',
          )
          return
        }
        syncJobs.shift()
        if (job.message) showToast(job.message)
      }
    })().finally(() => {
      enqueuing = null
      if (retryRequested) {
        retryRequested = false
        void drainSyncJobs()
      }
    })
    return enqueuing
  }

  function enqueueSync(work: () => Promise<boolean | void>, message?: string): void {
    syncJobs.push({ work, message })
    void drainSyncJobs()
  }

  watch(
    () => syncStore.connection,
    (connection) => {
      if (connection === 'online') void drainSyncJobs()
    },
  )
  watch(
    () => syncStore.userId,
    (userId, previous) => {
      if (previous && userId !== previous) syncJobs.length = 0
    },
  )

  function queueRulesThenPending(
    beforeRules: readonly RecurringRule[],
    beforePending: readonly PendingMovement[],
    rulesBeforePending: readonly RecurringRule[] = financialStateStore.state.recurringRules,
    message?: string,
  ): void {
    const afterRules = financialStateStore.state.recurringRules
    const afterPending = financialStateStore.state.pendingMovements
    const currency = financialStateStore.currency
    let rulesEnqueued = false
    enqueueSync(async () => {
      // The rule's create must finish its IndexedDB transaction before a
      // pending resolves its own id from the queue. No remote ack is needed.
      if (!rulesEnqueued) {
        if (
          (await syncListDiff('recurringRule', beforeRules, rulesBeforePending, (rule) =>
            buildRecurringRuleData(rule, currency),
          )) === false
        )
          return false
        rulesEnqueued = true
      }
      if (
        (await syncListDiff('pendingMovement', beforePending, afterPending, (pending) =>
          buildPendingMovementData(pending, currency),
        )) === false
      )
        return false
      // Advance the calendar only after every occurrence is durable. A restart
      // after a partial enqueue can then regenerate the missing occurrences.
      return syncListDiff('recurringRule', rulesBeforePending, afterRules, (rule) =>
        buildRecurringRuleData(rule, currency),
      )
    }, message)
  }

  function generatePending(today: string): number {
    const result = generatePendingMovements(financialStateStore.state, today)
    if (
      hasChanges(result.pendingMovements, financialStateStore.state.pendingMovements) ||
      hasChanges(result.recurringRules, rules.value)
    ) {
      financialStateStore.commitState((draft) => {
        draft.pendingMovements = result.pendingMovements
        draft.recurringRules = result.recurringRules
      })
    }
    return result.createdCount
  }

  function refreshPending(today = resolveToday()): number {
    const beforeRules = rules.value
    const beforePending = pendingMovements.value
    const count = generatePending(today)
    if (hasChanges(beforeRules, rules.value) || hasChanges(beforePending, pendingMovements.value)) {
      queueRulesThenPending(beforeRules, beforePending, beforeRules)
    } else {
      void drainSyncJobs()
    }
    return count
  }

  function addRule(input: NewRecurringRuleInput): boolean {
    if (
      !input.accountId ||
      !input.category ||
      !input.description.trim() ||
      input.amount <= 0 ||
      !input.startDate ||
      !isValidSaving(input)
    )
      return false
    const rule: RecurringRule = {
      id: uid('rule'),
      type: input.type,
      accountId: input.accountId,
      ...(input.type === 'saving' && input.destinationAccountId
        ? { destinationAccountId: input.destinationAccountId }
        : {}),
      category: input.category,
      description: input.description.trim(),
      amount: round2(input.amount),
      ...(input.symbol?.trim() ? { symbol: input.symbol.trim().toUpperCase() } : {}),
      ...(input.side ? { side: input.side } : {}),
      ...(input.units !== undefined ? { units: input.units } : {}),
      ...(input.unitPrice !== undefined ? { unitPrice: input.unitPrice } : {}),
      ...(input.fee !== undefined ? { fee: round2(input.fee) } : {}),
      ...(input.time ? { time: input.time } : {}),
      frequency: input.frequency,
      interval: Math.max(1, Math.floor(input.interval || 1)),
      startDate: input.startDate,
      endDate: input.endDate || null,
      active: true,
      lastExecutionDate: null,
      nextOccurrenceDate: input.startDate,
    }
    const beforeRules = rules.value
    const beforePending = pendingMovements.value
    financialStateStore.commitState((draft) => draft.recurringRules.push(rule))
    const rulesBeforePending = rules.value
    generatePending(resolveToday())
    queueRulesThenPending(
      beforeRules,
      beforePending,
      rulesBeforePending,
      'Regla recurrente guardada.',
    )
    return true
  }

  function updateRule(id: string, input: NewRecurringRuleInput): boolean {
    const currentRule = rules.value.find((rule) => rule.id === id)
    if (
      !currentRule ||
      !input.accountId ||
      !input.category ||
      !input.description.trim() ||
      input.amount <= 0 ||
      !input.startDate ||
      !isValidSaving(input)
    ) {
      return false
    }
    const hasExistingExecution =
      currentRule.lastExecutionDate !== null ||
      pendingMovements.value.some((pending) => pending.ruleId === id)

    const beforeRules = rules.value
    const beforePending = pendingMovements.value
    financialStateStore.commitState((draft) => {
      const rule = draft.recurringRules.find((item) => item.id === id)
      if (!rule) return

      const nextDate = hasExistingExecution
        ? rule.nextOccurrenceDate ||
          (rule.lastExecutionDate
            ? nextOccurrenceDate(rule, rule.lastExecutionDate)
            : input.startDate)
        : input.startDate
      rule.type = input.type
      rule.accountId = input.accountId
      if (input.type === 'saving' && input.destinationAccountId) {
        rule.destinationAccountId = input.destinationAccountId
      } else {
        delete rule.destinationAccountId
      }
      rule.category = input.category
      rule.description = input.description.trim()
      rule.amount = round2(input.amount)
      rule.frequency = input.frequency
      rule.interval = Math.max(1, Math.floor(input.interval || 1))
      rule.startDate = input.startDate
      rule.endDate = input.endDate || null
      rule.nextOccurrenceDate = nextDate

      delete rule.symbol
      delete rule.side
      delete rule.units
      delete rule.unitPrice
      delete rule.fee
      delete rule.time
      if (input.type === 'investment') {
        if (input.symbol?.trim()) rule.symbol = input.symbol.trim().toUpperCase()
        if (input.side) rule.side = input.side
        if (input.units !== undefined) rule.units = input.units
        if (input.unitPrice !== undefined) rule.unitPrice = input.unitPrice
        if (input.fee !== undefined) rule.fee = round2(input.fee)
        if (input.time) rule.time = input.time
      }
    })
    const rulesBeforePending = rules.value
    generatePending(resolveToday())
    queueRulesThenPending(
      beforeRules,
      beforePending,
      rulesBeforePending,
      'Regla recurrente actualizada.',
    )
    return true
  }

  function toggleRule(id: string, active: boolean): void {
    const before = rules.value
    financialStateStore.commitState((draft) => {
      const rule = draft.recurringRules.find((item) => item.id === id)
      if (rule) rule.active = active
    })
    const after = financialStateStore.state.recurringRules
    enqueueSync(() =>
      syncListDiff('recurringRule', before, after, (rule) =>
        buildRecurringRuleData(rule, financialStateStore.currency),
      ),
    )
  }

  function removeRule(id: string): void {
    const beforeRules = rules.value
    const beforePending = pendingMovements.value
    financialStateStore.commitState((draft) => {
      draft.recurringRules = draft.recurringRules.filter((rule) => rule.id !== id)
      draft.pendingMovements = draft.pendingMovements.map((pending) =>
        pending.ruleId === id && pending.status === 'pending'
          ? { ...pending, status: 'cancelled', updatedAt: new Date().toISOString() }
          : pending,
      )
    })
    queueRulesThenPending(beforeRules, beforePending)
  }

  /**
   * Confirms (optionally after editing) one pending. Resolves once the
   * reservation, the accepted edit and the single movement id are durable in
   * this browser and the optimistic confirmation is shown; the server
   * confirmation may still be in flight and is reported by the intent status.
   * A repeat or a reload reuses the reservation instead of deciding again.
   */
  async function confirmPending(
    id: string,
    edit?: Partial<PendingMovementEdit>,
  ): Promise<PendingConfirmationOutcome> {
    const pending = openPendingMovements.value.find((item) => item.id === id)
    if (!pending) {
      // Not open: either an accepted reservation is already projected, or the
      // pending was confirmed elsewhere. Reuse the reserved identity if any.
      return retryPendingConfirmation(id)
    }
    const fields = edit ? resolvePendingEdit(pending, edit) : confirmFieldsFromPending(pending)
    if (!fields) return { accepted: false, reason: 'invalid' }
    const now = new Date().toISOString()
    const transaction = buildPendingTransaction(fields, uid('tx'), now)
    const outcome = await confirmPendingMovementWrite({
      pendingId: id,
      ruleId: pending.ruleId,
      resolved: fields,
      transaction,
      edited: Boolean(edit),
      pendingCreatedAt: pending.createdAt,
      pendingUpdatedAt: now,
    })
    // Only the movement that was actually accepted is reported to Stock
    // Events; a repeat reuses the stored one and never re-fires the side effect.
    if (outcome.accepted && outcome.transactionId === transaction.id) {
      void stockEventsStore.syncMovement(transaction)
    }
    return outcome
  }

  function editPending(id: string, edit: PendingMovementEdit): boolean {
    const pending = openPendingMovements.value.find((item) => item.id === id)
    if (!pending) return false
    const fields = resolvePendingEdit(pending, edit)
    if (!fields) return false
    const before = pendingMovements.value
    financialStateStore.commitState((draft) => {
      const current = draft.pendingMovements.find(
        (item) => item.id === id && item.status === 'pending',
      )
      if (!current) return
      applyPendingEdit(current, fields, new Date().toISOString())
    })
    const after = financialStateStore.state.pendingMovements
    enqueueSync(
      () =>
        syncListDiff('pendingMovement', before, after, (pending) =>
          buildPendingMovementData(pending, financialStateStore.currency),
        ),
      'Pendiente actualizado.',
    )
    return true
  }

  function changePendingStatus(id: string, status: 'skipped' | 'cancelled'): void {
    const before = pendingMovements.value
    financialStateStore.commitState((draft) => {
      const pending = draft.pendingMovements.find(
        (item) => item.id === id && item.status === 'pending',
      )
      if (pending) {
        pending.status = status
        pending.updatedAt = new Date().toISOString()
      }
    })
    const after = financialStateStore.state.pendingMovements
    enqueueSync(
      () =>
        syncListDiff('pendingMovement', before, after, (pending) =>
          buildPendingMovementData(pending, financialStateStore.currency),
        ),
      status === 'skipped' ? 'Vencimiento saltado.' : 'Pendiente descartado.',
    )
  }

  return {
    rules,
    /** The engine's today: due dates and labels are measured from it. */
    resolveToday,
    pendingMovements,
    openPendingMovements,
    pendingCount,
    refreshPending,
    addRule,
    updateRule,
    toggleRule,
    removeRule,
    confirmPending,
    retryConfirmation: (id: string) => retryPendingConfirmation(id),
    discardConfirmation: (id: string) => discardPendingConfirmation(id),
    pendingConfirmationStatus: (id: string): Promise<PendingConfirmationStatus | null> =>
      readPendingConfirmationStatus(id),
    editPending,
    skipPending: (id: string) => changePendingStatus(id, 'skipped'),
    cancelPending: (id: string) => changePendingStatus(id, 'cancelled'),
  }
})

function resolveToday(): string {
  const candidate =
    typeof window !== 'undefined'
      ? (window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__
      : undefined
  return candidate || todayISO()
}

function hasChanges(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) !== JSON.stringify(right)
}
