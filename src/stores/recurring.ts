import { defineStore } from 'pinia'
import { computed } from 'vue'

import { generatePendingMovements } from '../domain/recurring/pending'
import { todayISO } from '../domain/recurring/occurrences'
import { computeInvestmentMovement } from '../scripts/investment-movements'
import type { InvestmentSide, RecurringFrequency, RecurringRule, Transaction, TransactionType } from '../scripts/types'
import { monthFromISO, round2, uid } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'
import { useStockEventsStore } from './stockevents'

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
      financialStateStore.commitState((draft) => {
        draft.pendingMovements = result.pendingMovements
        draft.recurringRules = result.recurringRules
      })
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
    financialStateStore.commitState((draft) => draft.recurringRules.push(rule))
    refreshPending()
    return true
  }

  function toggleRule(id: string, active: boolean): void {
    financialStateStore.commitState((draft) => {
      const rule = draft.recurringRules.find((item) => item.id === id)
      if (rule) rule.active = active
    })
  }

  function removeRule(id: string): void {
    financialStateStore.commitState((draft) => {
      draft.recurringRules = draft.recurringRules.filter((rule) => rule.id !== id)
      draft.pendingMovements = draft.pendingMovements.map((pending) => pending.ruleId === id && pending.status === 'pending'
        ? { ...pending, status: 'cancelled', updatedAt: new Date().toISOString() }
        : pending)
    })
  }

  function confirmPending(id: string, edit?: Partial<PendingMovementEdit>): boolean {
    const pending = openPendingMovements.value.find((item) => item.id === id)
    if (!pending) return false
    const occurrenceDate = edit?.date || pending.occurrenceDate
    const accountId = edit?.accountId || pending.accountId
    const category = edit?.category || pending.category
    const description = edit?.description || pending.description
    const amount = edit?.amount ?? pending.amount
    const transactionId = uid('tx')
    const transaction: Transaction = {
      id: transactionId,
      date: occurrenceDate,
      month: monthFromISO(occurrenceDate) ?? 0,
      type: pending.type,
      accountId,
      category,
      description: description.trim(),
      amount: pending.type === 'investment' && pending.side === 'sell' ? -Math.abs(amount) : Math.abs(amount),
      ...(pending.symbol ? { symbol: pending.symbol } : {}),
      ...(pending.side ? { side: pending.side } : {}),
      ...(pending.units !== undefined ? { units: pending.units } : {}),
      ...(pending.unitPrice !== undefined ? { unitPrice: pending.unitPrice } : {}),
      ...(pending.fee !== undefined ? { fee: pending.fee } : {}),
      ...(pending.time ? { time: pending.time } : {}),
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
        current.occurrenceDate = occurrenceDate
        current.accountId = accountId
        current.category = category
        current.description = description
        current.amount = amount
      }
    })
    if (confirmed) void stockEventsStore.syncMovement(transaction)
    return true
  }

  function editPending(id: string, edit: PendingMovementEdit): boolean {
    const pending = openPendingMovements.value.find((item) => item.id === id)
    if (!pending) return false
    const isInvestment = pending.type === 'investment'
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
    financialStateStore.commitState((draft) => {
      const current = draft.pendingMovements.find((item) => item.id === id && item.status === 'pending')
      if (!current) return
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
      }
      current.updatedAt = new Date().toISOString()
    })
    return true
  }

  function changePendingStatus(id: string, status: 'skipped' | 'cancelled'): void {
    financialStateStore.commitState((draft) => {
      const pending = draft.pendingMovements.find((item) => item.id === id && item.status === 'pending')
      if (pending) {
        pending.status = status
        pending.updatedAt = new Date().toISOString()
      }
    })
  }

  return {
    rules,
    pendingMovements,
    openPendingMovements,
    pendingCount,
    refreshPending,
    addRule,
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
