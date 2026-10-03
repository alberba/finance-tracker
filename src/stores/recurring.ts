import { defineStore } from 'pinia'
import { computed } from 'vue'

import { generatePendingMovements } from '../domain/recurring/pending'
import { nextOccurrenceDate, todayISO } from '../domain/recurring/occurrences'
import {
  resolveCategoryId,
  resolveOrCreateCategoryId,
  resolveEntityId,
  syncListDiff,
  type CategoryKind,
} from '../lib/client/command-mapping'
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
import { buildInvestmentTransactionData } from './investment'
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
 * command payload. Returns `null` (skip, see `syncListDiff`) when the
 * account hasn't synced yet; the parent rule is waited for rather than
 * skipped (see `resolveRecurringRuleId`). Both `recurringRuleId` and
 * `accountId` are required fields in `entityCreateSchemas.pendingMovement`
 * (see the WP10 fix note on `buildRecurringRuleData` above for `accountId`).
 */
async function buildPendingMovementData(pending: PendingMovement, currency: string) {
  const recurringRuleId = await resolveRecurringRuleId(pending.ruleId)
  if (!recurringRuleId) {
    return null
  }
  const accountId = await resolveEntityId('account', pending.accountId)
  if (!accountId) {
    return null
  }
  const categoryId = await resolveOrCreateCategoryId(pending.type as CategoryKind, pending.category)
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
    transactionId: pending.transactionId,
    status: pending.status,
  }
}

/**
 * How many times `resolveRecurringRuleId` re-asks for a rule's server id
 * before giving up. Each attempt costs one flush plus one macrotask.
 */
const RULE_RESOLUTION_ATTEMPTS = 10

/**
 * A pending movement cannot exist server-side before the rule that
 * generated it: `recurringRuleId` is a required reference
 * (`entityCreateSchemas.pendingMovement`). But `addRule` enqueues the
 * rule's `create` and generates its first occurrences in the same tick, so
 * at that instant the rule has no server id yet — and a skipped occurrence
 * is never mutated again, so it used to be skipped forever and the pending
 * movement simply never reached D1 (audit §3.2c).
 *
 * So wait for the rule to cross instead of giving up: each attempt asks
 * the outbox to flush and re-reads the local cache, which is where the
 * server's answer lands.
 */
async function resolveRecurringRuleId(localRuleId: string): Promise<string | null> {
  for (let attempt = 0; attempt < RULE_RESOLUTION_ATTEMPTS; attempt += 1) {
    const resolved = await resolveEntityId('recurringRule', localRuleId)
    if (resolved) {
      return resolved
    }
    const syncStore = useSyncStore()
    if (!syncStore.enabled) {
      return null
    }
    // `flush()` returns at once when another flush is already in flight —
    // and `addRule` starts one. Asking again in the next tick would burn
    // every attempt without the rule ever crossing, and the occurrence is
    // dropped for good. So wait for the flush that *is* running to land.
    await syncStore.flush()
    await waitWhileSyncing(syncStore)
  }
  return null
}

/** How many macrotasks to give an in-flight flush before asking again. */
const FLUSH_SETTLE_TICKS = 20

async function waitWhileSyncing(syncStore: ReturnType<typeof useSyncStore>): Promise<void> {
  for (let tick = 0; tick < FLUSH_SETTLE_TICKS; tick += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (syncStore.syncStatus !== 'syncing') {
      return
    }
  }
}

/** WP7b — maps a legacy `Transaction` row to a `transaction` sync command payload. See the WP10 fix note on `buildRecurringRuleData` above for `accountId`. */
async function buildTransactionData(tx: Transaction, currency: string) {
  const accountId = await resolveEntityId('account', tx.accountId)
  if (!accountId) {
    return null
  }
  const categoryId = await resolveCategoryId(tx.type as CategoryKind, tx.category)
  return {
    accountId,
    categoryId,
    type: tx.type,
    date: tx.date,
    description: tx.description,
    amount: tx.amount,
    currency,
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
  const rules = computed(() => financialStateStore.state.recurringRules)
  const pendingMovements = computed(() => financialStateStore.state.pendingMovements)
  const openPendingMovements = computed(() => pendingMovements.value.filter((item) => item.status === 'pending'))
  const pendingCount = computed(() => openPendingMovements.value.length)

  function refreshPending(today = resolveToday()): number {
    const result = generatePendingMovements(financialStateStore.state, today)
    if (hasChanges(result.pendingMovements, financialStateStore.state.pendingMovements) || hasChanges(result.recurringRules, rules.value)) {
      const beforePending = financialStateStore.state.pendingMovements
      const beforeRules = rules.value
      financialStateStore.commitState((draft) => {
        draft.pendingMovements = result.pendingMovements
        draft.recurringRules = result.recurringRules
      })
      void syncListDiff('recurringRule', beforeRules, financialStateStore.state.recurringRules, (rule) =>
        buildRecurringRuleData(rule, financialStateStore.currency),
      )
      void syncListDiff('pendingMovement', beforePending, financialStateStore.state.pendingMovements, (pending) =>
        buildPendingMovementData(pending, financialStateStore.currency),
      )
    }
    return result.createdCount
  }

  function addRule(input: NewRecurringRuleInput): boolean {
    if (!input.accountId || !input.category || !input.description.trim() || input.amount <= 0 || !input.startDate) return false
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
    const before = financialStateStore.state.recurringRules
    financialStateStore.commitState((draft) => draft.recurringRules.push(rule))
    void syncListDiff('recurringRule', before, financialStateStore.state.recurringRules, (item) =>
      buildRecurringRuleData(item, financialStateStore.currency),
    )
    refreshPending()
    return true
  }

  function updateRule(id: string, input: NewRecurringRuleInput): boolean {
    const currentRule = rules.value.find((rule) => rule.id === id)
    if (!currentRule || !input.accountId || !input.category || !input.description.trim() || input.amount <= 0 || !input.startDate) {
      return false
    }
    const hasExistingExecution = currentRule.lastExecutionDate !== null
      || pendingMovements.value.some((pending) => pending.ruleId === id)

    // Snapshot *before* the mutation: `refreshPending`'s own diff is taken
    // after it, and compares against a copy `generatePendingMovements`
    // rebuilt from the edited rule — identical but for the dates. So an
    // edit that does not move the calendar produced no command at all, and
    // was lost on the next reload (audit §3.2a).
    const before = financialStateStore.state.recurringRules

    financialStateStore.commitState((draft) => {
      const rule = draft.recurringRules.find((item) => item.id === id)
      if (!rule) return

      const nextDate = hasExistingExecution
        ? rule.nextOccurrenceDate || (rule.lastExecutionDate ? nextOccurrenceDate(rule, rule.lastExecutionDate) : input.startDate)
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
    void syncListDiff('recurringRule', before, financialStateStore.state.recurringRules, (item) =>
      buildRecurringRuleData(item, financialStateStore.currency),
    )
    refreshPending()
    return true
  }

  function toggleRule(id: string, active: boolean): void {
    const before = financialStateStore.state.recurringRules
    financialStateStore.commitState((draft) => {
      const rule = draft.recurringRules.find((item) => item.id === id)
      if (rule) rule.active = active
    })
    void syncListDiff('recurringRule', before, financialStateStore.state.recurringRules, (item) =>
      buildRecurringRuleData(item, financialStateStore.currency),
    )
  }

  function removeRule(id: string): void {
    const beforeRules = financialStateStore.state.recurringRules
    const beforePending = financialStateStore.state.pendingMovements
    financialStateStore.commitState((draft) => {
      draft.recurringRules = draft.recurringRules.filter((rule) => rule.id !== id)
      draft.pendingMovements = draft.pendingMovements.map((pending) => pending.ruleId === id && pending.status === 'pending'
        ? { ...pending, status: 'cancelled', updatedAt: new Date().toISOString() }
        : pending)
    })
    void syncListDiff('recurringRule', beforeRules, financialStateStore.state.recurringRules, (item) =>
      buildRecurringRuleData(item, financialStateStore.currency),
    )
    void syncListDiff('pendingMovement', beforePending, financialStateStore.state.pendingMovements, (pending) =>
      buildPendingMovementData(pending, financialStateStore.currency),
    )
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
    const beforePending = financialStateStore.state.pendingMovements
    const transaction: Transaction = {
      id: transactionId,
      date: occurrenceDate,
      month: monthFromISO(occurrenceDate) ?? 0,
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
    // An investment carries its operación and hora, which the bare payload
    // drops — the server copy would then come back without them (#205).
    void syncListDiff('transaction', beforeTransactions, financialStateStore.transactions, (tx) =>
      tx.type === 'investment'
        ? buildInvestmentTransactionData(tx, financialStateStore.currency)
        : buildTransactionData(tx, financialStateStore.currency),
    )
    void syncListDiff('pendingMovement', beforePending, financialStateStore.state.pendingMovements, (pending) =>
      buildPendingMovementData(pending, financialStateStore.currency),
    )
    if (confirmed) void stockEventsStore.syncMovement(transaction)
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
    const validInvestment = !investment || (investment.normalizedSymbol && investment.normalizedUnits > 0 && investment.normalizedUnitPrice > 0)
    const valid = edit.date && edit.accountId && edit.category && edit.description.trim() && amount > 0 && validInvestment
    if (!valid) return false
    const before = financialStateStore.state.pendingMovements
    financialStateStore.commitState((draft) => {
      const current = draft.pendingMovements.find((item) => item.id === id && item.status === 'pending')
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
    void syncListDiff('pendingMovement', before, financialStateStore.state.pendingMovements, (pending) =>
      buildPendingMovementData(pending, financialStateStore.currency),
    )
    return true
  }

  function changePendingStatus(id: string, status: 'skipped' | 'cancelled'): void {
    const before = financialStateStore.state.pendingMovements
    financialStateStore.commitState((draft) => {
      const pending = draft.pendingMovements.find((item) => item.id === id && item.status === 'pending')
      if (pending) {
        pending.status = status
        pending.updatedAt = new Date().toISOString()
      }
    })
    void syncListDiff('pendingMovement', before, financialStateStore.state.pendingMovements, (pending) =>
      buildPendingMovementData(pending, financialStateStore.currency),
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
  const candidate = typeof window !== 'undefined'
    ? (window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__
    : undefined
  return candidate || todayISO()
}

function hasChanges(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) !== JSON.stringify(right)
}
