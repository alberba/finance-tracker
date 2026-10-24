import type { PendingMovement, RecurringRule, State } from '../../scripts/types'
import { uid } from '../../scripts/utils'
import { buildOccurrenceKey, getDueOccurrences, getNextRuleDate, nextOccurrenceDate, todayISO } from './occurrences'

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
