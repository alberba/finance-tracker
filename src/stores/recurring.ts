import { defineStore } from 'pinia'

import { computed, watch } from 'vue'

import { useToast } from '../composables/useToast'
import { generatePendingMovements } from '../domain/recurring/pending'
import { nextOccurrenceDate, todayISO } from '../domain/recurring/occurrences'
import {
  resolveOrCreateCategoryId,
  resolveEntityId,
  syncListDiff,
  type CategoryKind,
} from '../lib/client/command-mapping'
import { syncMovements } from '../lib/client/movement-commands'
import { computeInvestmentMovement } from '../scripts/investment-movements'
import type {
  InvestmentSide,
  PendingMovement,
  RecurringFrequency,
  RecurringRule,
  Transaction,
  TransactionType,
} from '../scripts/types'
import { monthFromISO, round2, uid } from '../scripts/utils'
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
  const categoryId = await resolveOrCreateCategoryId(rule.type as CategoryKind, rule.category)
  if (!categoryId) return null
  return {
    name: rule.description,
    type: rule.type,
    accountId,
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

function clearInvestmentFields(target: {
  symbol?: string
  side?: InvestmentSide
  units?: number
  unitPrice?: number
  fee?: number
  time?: string
}): void {
  delete target.symbol
  delete target.side
  delete target.units
  delete target.unitPrice
  delete target.fee
  delete target.time
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
  const categoryId = await resolveOrCreateCategoryId(pending.type as CategoryKind, pending.category)
  if (!categoryId) return null
  const transactionId = pending.transactionId
    ? await resolveEntityId('transaction', pending.transactionId)
    : null
  if (pending.transactionId && !transactionId) return null
  return {
    recurringRuleId,
    accountId,
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

export interface PendingMovementEdit {
  date: string
  accountId: string
  category: string
  description: string
  amount: number
  type?: TransactionType
  symbol?: string
  side?: InvestmentSide
  units?: number
  unitPrice?: number
  fee?: number
  time?: string
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
      !input.startDate
    )
      return false
    const rule: RecurringRule = {
      id: uid('rule'),
      type: input.type,
      accountId: input.accountId,
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
      !input.startDate
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

  function confirmPending(id: string, edit?: Partial<PendingMovementEdit>): boolean {
    const pending = openPendingMovements.value.find((item) => item.id === id)
    if (!pending) return false
    const occurrenceDate = edit?.date || pending.occurrenceDate
    const accountId = edit?.accountId || pending.accountId
    const category = edit?.category || pending.category
    const description = edit?.description || pending.description
    const amount = edit?.amount ?? pending.amount
    const type = edit?.type || pending.type
    const symbol = edit?.symbol ?? pending.symbol
    const side = edit?.side ?? pending.side
    const units = edit?.units ?? pending.units
    const unitPrice = edit?.unitPrice ?? pending.unitPrice
    const fee = edit?.fee ?? pending.fee
    const time = edit?.time ?? pending.time
    const transactionId = uid('tx')
    const beforeTransactions = financialStateStore.transactions
    const beforePending = pendingMovements.value
    const transaction: Transaction = {
      id: transactionId,
      date: occurrenceDate,
      month: monthFromISO(occurrenceDate) ?? 1,
      type,
      accountId,
      category,
      description: description.trim(),
      amount: type === 'investment' && side === 'sell' ? -Math.abs(amount) : Math.abs(amount),
      ...(symbol ? { symbol } : {}),
      ...(side ? { side } : {}),
      ...(units !== undefined ? { units } : {}),
      ...(unitPrice !== undefined ? { unitPrice } : {}),
      ...(fee !== undefined ? { fee } : {}),
      ...(time ? { time } : {}),
      declared: false,
      createdAt: new Date().toISOString(),
    }
    let confirmed = false
    financialStateStore.commitState((draft) => {
      const current = draft.pendingMovements.find((item) => item.id === id)
      if (!current || current.status !== 'pending') return
      draft.transactions.push(transaction)
      confirmed = true
      current.status = 'confirmed'
      current.transactionId = transactionId
      current.updatedAt = new Date().toISOString()
      if (edit) {
        current.type = type
        current.occurrenceDate = occurrenceDate
        current.accountId = accountId
        current.category = category
        current.description = description
        current.amount = amount
        if (type === 'investment') {
          if (symbol !== undefined) current.symbol = symbol
          if (side !== undefined) current.side = side
          if (units !== undefined) current.units = units
          if (unitPrice !== undefined) current.unitPrice = unitPrice
          if (fee !== undefined) current.fee = fee
          if (time !== undefined) current.time = time
        } else {
          clearInvestmentFields(current)
        }
      }
    })
    const afterTransactions = financialStateStore.transactions
    const afterPending = financialStateStore.state.pendingMovements
    const currency = financialStateStore.currency
    // In order, not side by side: both resolve the same category, and the
    // pending must be built once the movement has queued its create, or each
    // mints its own id and the pending references one that is never created.
    let movementEnqueued = false
    enqueueSync(async () => {
      let pendingEnqueued: boolean | void
      try {
        if (!movementEnqueued) {
          movementEnqueued =
            (await syncMovements(beforeTransactions, afterTransactions, currency)) !== false
        }
      } finally {
        // Preserve the pending sync attempt even if movement sync fails.
        pendingEnqueued = await syncListDiff(
          'pendingMovement',
          beforePending,
          afterPending,
          (pending) => buildPendingMovementData(pending, currency),
        )
      }
      return movementEnqueued && pendingEnqueued !== false
    }, 'Pendiente confirmado: ya cuenta en el Registro.')
    if (confirmed) {
      void stockEventsStore.syncMovement(transaction)
    }
    return true
  }

  function editPending(id: string, edit: PendingMovementEdit): boolean {
    const pending = openPendingMovements.value.find((item) => item.id === id)
    if (!pending) return false
    const targetType = edit.type || pending.type
    const isInvestment = targetType === 'investment'
    const investment = isInvestment
      ? computeInvestmentMovement({
          side: edit.side || pending.side || 'buy',
          symbol: edit.symbol ?? pending.symbol ?? '',
          units: edit.units ?? pending.units ?? 0,
          unitPrice: edit.unitPrice ?? pending.unitPrice ?? 0,
          fee: edit.fee ?? pending.fee ?? 0,
        })
      : null
    const amount = investment ? Math.abs(investment.signedAmount) : round2(edit.amount)
    const validInvestment =
      !investment ||
      (investment.normalizedSymbol &&
        investment.normalizedUnits > 0 &&
        investment.normalizedUnitPrice > 0)
    const valid =
      edit.date &&
      edit.accountId &&
      edit.category &&
      edit.description.trim() &&
      amount > 0 &&
      validInvestment
    if (!valid) return false
    const before = pendingMovements.value
    financialStateStore.commitState((draft) => {
      const current = draft.pendingMovements.find(
        (item) => item.id === id && item.status === 'pending',
      )
      if (!current) return
      current.type = targetType
      current.occurrenceDate = edit.date
      current.accountId = edit.accountId
      current.category = edit.category
      current.description = edit.description.trim()
      current.amount = amount
      if (investment) {
        current.symbol = investment.normalizedSymbol
        current.side = edit.side || current.side || 'buy'
        current.units = investment.normalizedUnits
        current.unitPrice = investment.normalizedUnitPrice
        current.fee = investment.normalizedFee
        if (edit.time !== undefined) {
          if (edit.time) current.time = edit.time
          else delete current.time
        }
      } else {
        clearInvestmentFields(current)
      }
      current.updatedAt = new Date().toISOString()
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
