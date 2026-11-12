import { defineStore } from 'pinia'

import { computed } from 'vue'

import { useToast } from '../composables/useToast'
import {
  applyPendingEdit,
  buildPendingTransaction,
  confirmFieldsFromPending,
  generatePendingMovements,
  isValidSaving,
  resolvePendingEdit,
  type PendingMovementEdit,
} from '../domain/recurring/pending'
import { nextOccurrenceDate, todayISO } from '../domain/recurring/occurrences'
import {
  confirmPendingMovement as confirmPendingMovementWrite,
  discardPendingConfirmation,
  pendingConfirmationStatus as readPendingConfirmationStatus,
  retryPendingConfirmation,
  type PendingConfirmationOutcome,
  type PendingConfirmationStatus,
} from '../lib/client/recurring-write'
import {
  discardRecurringRuleWrites,
  recurringRuleWriteStatuses,
  removeRecurringRule,
  retryRecurringRuleWrites,
  savePendingMovement as savePendingMovementWrite,
  saveRecurringRule,
  type RecurringRuleWriteOutcome,
  type RecurringRuleWriteStatus,
} from '../lib/client/recurring-rule-write'
import type {
  PendingMovement,
  RecurringFrequency,
  RecurringRule,
  TransactionType,
} from '../scripts/types'
import { round2, uid } from '../scripts/utils'
import { useFinancialStateStore } from './financial-state'
import { useStockEventsStore } from './stockevents'

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

  function generateFor(rule: RecurringRule, pending: readonly PendingMovement[], today: string) {
    const result = generatePendingMovements(
      { recurringRules: [rule], pendingMovements: [...pending] },
      today,
    )
    return { calendar: result.recurringRules[0] ?? rule, generated: result }
  }

  /**
   * Acceptance reports "guardada" only once the rule, its occurrences and the
   * calendar advance are reconstructible from local storage; the module owns
   * that order and the retries. No remote acknowledgement is awaited.
   */
  async function persistRuleWrite(
    action: 'create' | 'update',
    rule: RecurringRule,
    pendings: readonly PendingMovement[],
    calendar: RecurringRule | null,
    message: string,
  ): Promise<boolean> {
    const outcome = await saveRecurringRule({ action, rule, pendings, calendar, message })
    if (!outcome.accepted) {
      showToast(
        outcome.message ??
          '⚠️ El cambio aún no está guardado. Se reintentará al reconectar o actualizar pendientes.',
      )
      return false
    }
    return true
  }

  /**
   * Applies the calendar to every rule and persists one rule write per rule
   * that changed. The pure generator stays in the domain; the module only
   * decides the durable order.
   */
  async function refreshPending(today = resolveToday()): Promise<number> {
    const result = generatePendingMovements(financialStateStore.state, today)
    const beforePendingIds = new Set(pendingMovements.value.map((item) => item.id))
    const newPendings = result.pendingMovements.filter((item) => !beforePendingIds.has(item.id))
    const changedRules = result.recurringRules.filter((rule) => {
      const current = rules.value.find((item) => item.id === rule.id)
      return (
        !current ||
        current.lastExecutionDate !== rule.lastExecutionDate ||
        current.nextOccurrenceDate !== rule.nextOccurrenceDate ||
        newPendings.some((pending) => pending.ruleId === rule.id)
      )
    })
    for (const calendar of changedRules) {
      const current = rules.value.find((item) => item.id === calendar.id)
      if (!current) continue
      await saveRecurringRule({
        action: 'refresh',
        rule: current,
        pendings: newPendings.filter((pending) => pending.ruleId === calendar.id),
        calendar:
          current.lastExecutionDate !== calendar.lastExecutionDate ||
          current.nextOccurrenceDate !== calendar.nextOccurrenceDate
            ? calendar
            : null,
      })
    }
    return result.createdCount
  }

  async function addRule(input: NewRecurringRuleInput): Promise<boolean> {
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
    const { calendar, generated } = generateFor(rule, pendingMovements.value, resolveToday())
    const beforePendingIds = new Set(pendingMovements.value.map((item) => item.id))
    const pendings = generated.pendingMovements.filter((item) => !beforePendingIds.has(item.id))
    return persistRuleWrite(
      'create',
      rule,
      pendings,
      calendarChanged(rule, calendar) ? calendar : null,
      'Regla recurrente guardada.',
    )
  }

  async function updateRule(id: string, input: NewRecurringRuleInput): Promise<boolean> {
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
    const nextRule = applyRuleInput(currentRule, input, hasExistingExecution)
    const { calendar, generated } = generateFor(nextRule, pendingMovements.value, resolveToday())
    const beforePendingIds = new Set(pendingMovements.value.map((item) => item.id))
    const pendings = generated.pendingMovements.filter((item) => !beforePendingIds.has(item.id))
    return persistRuleWrite(
      'update',
      nextRule,
      pendings,
      calendarChanged(nextRule, calendar) ? calendar : null,
      'Regla recurrente actualizada.',
    )
  }

  /** Pausing or resuming only changes the rule; no occurrence is generated. */
  async function toggleRule(id: string, active: boolean): Promise<void> {
    const current = rules.value.find((rule) => rule.id === id)
    if (!current || current.active === active) return
    const outcome = await saveRecurringRule({
      action: 'update',
      rule: { ...current, active },
      pendings: [],
      calendar: null,
    })
    if (!outcome.accepted) {
      showToast(outcome.message ?? '⚠️ El cambio aún no está guardado.')
    }
  }

  /** The server cascades a removed rule's pendings; the module owns that order. */
  async function removeRule(id: string): Promise<void> {
    const rule = rules.value.find((item) => item.id === id)
    if (!rule) return
    const outcome = await removeRecurringRule(rule)
    if (!outcome.accepted) {
      showToast(outcome.message ?? '⚠️ La regla aún no se ha podido eliminar.')
    }
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

  async function editPending(id: string, edit: PendingMovementEdit): Promise<boolean> {
    const pending = openPendingMovements.value.find((item) => item.id === id)
    if (!pending) return false
    const fields = resolvePendingEdit(pending, edit)
    if (!fields) return false
    const draft = { ...pending }
    applyPendingEdit(draft, fields, new Date().toISOString())
    const saved = await savePendingMovementWrite(draft, 'Pendiente actualizado.')
    if (!saved.accepted) {
      showToast(saved.message ?? '⚠️ El pendiente aún no está guardado.')
      return false
    }
    return true
  }

  async function changePendingStatus(id: string, status: 'skipped' | 'cancelled'): Promise<void> {
    const pending = pendingMovements.value.find(
      (item) => item.id === id && item.status === 'pending',
    )
    if (!pending) return
    const draft = { ...pending, status, updatedAt: new Date().toISOString() }
    const saved = await savePendingMovementWrite(
      draft,
      status === 'skipped' ? 'Vencimiento saltado.' : 'Pendiente descartado.',
    )
    if (!saved.accepted) {
      showToast(saved.message ?? '⚠️ El cambio aún no está guardado.')
    }
  }

  /** Retries the failed/discarded durable writes of one rule. */
  function retryRuleWrite(id: string): Promise<RecurringRuleWriteOutcome> {
    return retryRecurringRuleWrites(id)
  }

  /** Discards what is still cancellable without reverting confirmed effects. */
  function discardRuleWrite(id: string): ReturnType<typeof discardRecurringRuleWrites> {
    return discardRecurringRuleWrites(id)
  }

  function ruleWriteStatus(id?: string): Promise<RecurringRuleWriteStatus[]> {
    return recurringRuleWriteStatuses(id)
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
    retryRuleWrite,
    discardRuleWrite,
    ruleWriteStatus,
  }
})

/** The accepted edit, applied to a copy of the rule; the calendar is decided later. */
function applyRuleInput(
  currentRule: RecurringRule,
  input: NewRecurringRuleInput,
  hasExistingExecution: boolean,
): RecurringRule {
  const rule: RecurringRule = { ...currentRule }
  const nextDate = hasExistingExecution
    ? rule.nextOccurrenceDate ||
      (rule.lastExecutionDate ? nextOccurrenceDate(rule, rule.lastExecutionDate) : input.startDate)
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
  return rule
}

function calendarChanged(rule: RecurringRule, calendar: RecurringRule): boolean {
  return (
    rule.lastExecutionDate !== calendar.lastExecutionDate ||
    rule.nextOccurrenceDate !== calendar.nextOccurrenceDate
  )
}

function resolveToday(): string {
  const candidate =
    typeof window !== 'undefined'
      ? (window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__
      : undefined
  return candidate || todayISO()
}
