import { computeInvestmentMovement } from '../../scripts/investment-movements'
import type {
  InvestmentSide,
  PendingMovement,
  RecurringRule,
  State,
  Transaction,
  TransactionType,
} from '../../scripts/types'
import { monthFromISO, round2, uid } from '../../scripts/utils'
import {
  buildOccurrenceKey,
  getDueOccurrences,
  getNextRuleDate,
  nextOccurrenceDate,
  todayISO,
} from './occurrences'

export interface PendingGenerationResult {
  pendingMovements: PendingMovement[]
  recurringRules: RecurringRule[]
  createdCount: number
}

export function generatePendingMovements(
  state: Pick<State, 'recurringRules' | 'pendingMovements'>,
  today = todayISO(),
): PendingGenerationResult {
  const pendingMovements = [...state.pendingMovements]
  const existingKeys = new Set(pendingMovements.map((item) => item.occurrenceKey))
  let createdCount = 0

  const recurringRules = state.recurringRules.map((rule) => {
    const dueOccurrences = getDueOccurrences(rule, today)
    dueOccurrences.forEach((occurrenceDate) => {
      const occurrenceKey = buildOccurrenceKey(rule.id, occurrenceDate)
      if (existingKeys.has(occurrenceKey)) return

      pendingMovements.push(createPendingMovement(rule, occurrenceDate, occurrenceKey, today))
      existingKeys.add(occurrenceKey)
      createdCount += 1
    })

    const latestDue = dueOccurrences[dueOccurrences.length - 1]
    const lastExecutionDate = latestDue || rule.lastExecutionDate
    const nextDate = rule.active
      ? latestDue
        ? nextOccurrenceDate(rule, latestDue)
        : getNextRuleDate(rule, today)
      : rule.nextOccurrenceDate

    return {
      ...rule,
      lastExecutionDate,
      nextOccurrenceDate: rule.endDate && nextDate && nextDate > rule.endDate ? null : nextDate,
    }
  })

  return { pendingMovements, recurringRules, createdCount }
}

function createPendingMovement(
  rule: RecurringRule,
  occurrenceDate: string,
  occurrenceKey: string,
  today: string,
): PendingMovement {
  const timestamp = `${today}T00:00:00.000Z`
  return {
    id: uid('pending'),
    occurrenceKey,
    ruleId: rule.id,
    occurrenceDate,
    type: rule.type,
    accountId: rule.accountId,
    ...(rule.destinationAccountId ? { destinationAccountId: rule.destinationAccountId } : {}),
    category: rule.category,
    description: rule.description,
    amount: rule.amount,
    ...(rule.symbol ? { symbol: rule.symbol } : {}),
    ...(rule.side ? { side: rule.side } : {}),
    ...(rule.units !== undefined ? { units: rule.units } : {}),
    ...(rule.unitPrice !== undefined ? { unitPrice: rule.unitPrice } : {}),
    ...(rule.fee !== undefined ? { fee: rule.fee } : {}),
    ...(rule.time ? { time: rule.time } : {}),
    status: 'pending',
    createdAt: timestamp,
    updatedAt: timestamp,
    transactionId: null,
  }
}

/** An edit to a pending movement, as the confirmation panel sends it. */
export interface PendingMovementEdit {
  date: string
  accountId: string
  destinationAccountId?: string
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

/**
 * The final fields of a pending movement after an edit. `amount` is the
 * unsigned figure the pending row shows; `signedAmount` is what the movement
 * records (an investment sale is negative).
 */
export interface ResolvedPendingEdit {
  type: TransactionType
  occurrenceDate: string
  accountId: string
  destinationAccountId?: string
  category: string
  description: string
  amount: number
  signedAmount: number
  symbol?: string
  side?: InvestmentSide
  units?: number
  unitPrice?: number
  fee?: number
  time?: string
}

/** Resolves an edit against the pending row, validating it like the panel does. */
export function resolvePendingEdit(
  pending: PendingMovement,
  edit: Partial<PendingMovementEdit>,
): ResolvedPendingEdit | null {
  const type = edit.type ?? pending.type
  const investment =
    type === 'investment'
      ? computeInvestmentMovement({
          side: edit.side ?? pending.side ?? 'buy',
          symbol: edit.symbol ?? pending.symbol ?? '',
          units: edit.units ?? pending.units ?? 0,
          unitPrice: edit.unitPrice ?? pending.unitPrice ?? 0,
          fee: edit.fee ?? pending.fee ?? 0,
        })
      : null
  const amount = investment
    ? Math.abs(investment.signedAmount)
    : round2(edit.amount ?? pending.amount)
  const fields: ResolvedPendingEdit = {
    type,
    occurrenceDate: edit.date ?? pending.occurrenceDate,
    accountId: edit.accountId ?? pending.accountId,
    destinationAccountId:
      type === 'saving' ? (edit.destinationAccountId ?? pending.destinationAccountId) : undefined,
    category: edit.category ?? pending.category,
    description: (edit.description ?? pending.description).trim(),
    amount,
    signedAmount: investment ? investment.signedAmount : amount,
    ...(investment
      ? {
          symbol: investment.normalizedSymbol,
          side: edit.side ?? pending.side ?? 'buy',
          units: investment.normalizedUnits,
          unitPrice: investment.normalizedUnitPrice,
          fee: investment.normalizedFee,
          time: (edit.time ?? pending.time)?.trim() || undefined,
        }
      : {}),
  }
  return isValidPendingEdit(fields) ? fields : null
}

export function isValidPendingEdit(fields: ResolvedPendingEdit): boolean {
  return Boolean(
    fields.occurrenceDate &&
    fields.accountId &&
    isValidSaving(fields) &&
    fields.category &&
    fields.description &&
    fields.amount > 0 &&
    (fields.type !== 'investment' ||
      (fields.symbol && (fields.units ?? 0) > 0 && (fields.unitPrice ?? 0) > 0)),
  )
}

/** A confirmation without edits keeps the pending row exactly as it is. */
export function confirmFieldsFromPending(pending: PendingMovement): ResolvedPendingEdit {
  const amount = Math.abs(pending.amount)
  return {
    type: pending.type,
    occurrenceDate: pending.occurrenceDate,
    accountId: pending.accountId,
    destinationAccountId: pending.type === 'saving' ? pending.destinationAccountId : undefined,
    category: pending.category,
    description: pending.description.trim(),
    amount: pending.amount,
    signedAmount: pending.type === 'investment' && pending.side === 'sell' ? -amount : amount,
    symbol: pending.symbol,
    side: pending.side,
    units: pending.units,
    unitPrice: pending.unitPrice,
    fee: pending.fee,
    time: pending.time,
  }
}

/** Projects the accepted edit onto the pending row, keeping its own timestamps. */
export function applyPendingEdit(
  current: PendingMovement,
  fields: ResolvedPendingEdit,
  updatedAt: string,
): void {
  current.type = fields.type
  current.occurrenceDate = fields.occurrenceDate
  current.accountId = fields.accountId
  if (fields.type === 'saving' && fields.destinationAccountId) {
    current.destinationAccountId = fields.destinationAccountId
  } else {
    delete current.destinationAccountId
  }
  current.category = fields.category
  current.description = fields.description
  current.amount = fields.amount
  if (fields.type === 'investment') {
    if (fields.symbol) current.symbol = fields.symbol
    if (fields.side) current.side = fields.side
    if (fields.units !== undefined) current.units = fields.units
    if (fields.unitPrice !== undefined) current.unitPrice = fields.unitPrice
    if (fields.fee !== undefined) current.fee = fields.fee
    if (fields.time) current.time = fields.time
    else delete current.time
  } else {
    clearInvestmentFields(current)
  }
  current.updatedAt = updatedAt
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

/** The movement a confirmed pending records, built from the decided fields. */
export function buildPendingTransaction(
  fields: ResolvedPendingEdit,
  transactionId: string,
  createdAt: string,
): Transaction {
  return {
    id: transactionId,
    date: fields.occurrenceDate,
    month: monthFromISO(fields.occurrenceDate) ?? 1,
    type: fields.type,
    accountId: fields.accountId,
    ...(fields.destinationAccountId ? { destinationAccountId: fields.destinationAccountId } : {}),
    category: fields.category,
    description: fields.description,
    amount: fields.signedAmount,
    ...(fields.symbol ? { symbol: fields.symbol } : {}),
    ...(fields.side ? { side: fields.side } : {}),
    ...(fields.units !== undefined ? { units: fields.units } : {}),
    ...(fields.unitPrice !== undefined ? { unitPrice: fields.unitPrice } : {}),
    ...(fields.fee !== undefined ? { fee: fields.fee } : {}),
    ...(fields.time ? { time: fields.time } : {}),
    declared: false,
    createdAt,
  }
}

/** A saving needs a destination different from its origin; other types ignore it. */
export function isValidSaving(input: {
  type: TransactionType
  accountId: string
  destinationAccountId?: string
}): boolean {
  return (
    input.type !== 'saving' ||
    (Boolean(input.destinationAccountId) && input.destinationAccountId !== input.accountId)
  )
}
