import type { State, Subscription, SubscriptionFrequency } from './types'
import { monthFromISO, round2, uid } from './utils'

export interface DueSubscriptionsResult {
  generatedCount: number
  advancedCount: number
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : null
}

function formatIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`
}

function daysInMonth(year: number, zeroBasedMonth: number): number {
  return new Date(Date.UTC(year, zeroBasedMonth + 1, 0)).getUTCDate()
}

function addMonths(date: Date, months: number, anchorDay: number): Date {
  const targetMonth = date.getUTCMonth() + months
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12)
  const normalizedMonth = ((targetMonth % 12) + 12) % 12
  return new Date(Date.UTC(targetYear, normalizedMonth, Math.min(anchorDay, daysInMonth(targetYear, normalizedMonth))))
}

export function advanceSubscriptionDate(subscription: Subscription): string {
  const current = parseIsoDate(subscription.nextChargeDate)
  const start = parseIsoDate(subscription.startDate)
  if (!current || !start) {
    return subscription.nextChargeDate
  }

  if (subscription.frequency === 'weekly') {
    current.setUTCDate(current.getUTCDate() + 7)
    return formatIsoDate(current)
  }

  const monthsByFrequency: Record<Exclude<SubscriptionFrequency, 'weekly'>, number> = {
    monthly: 1,
    quarterly: 3,
    yearly: 12,
  }
  return formatIsoDate(addMonths(current, monthsByFrequency[subscription.frequency], start.getUTCDate()))
}

export function getFirstUpcomingChargeDate(
  subscription: Pick<Subscription, 'frequency' | 'startDate' | 'nextChargeDate'>,
  today: string,
): string {
  const normalized: Subscription = {
    ...subscription,
    id: '',
    name: '',
    amount: 0,
    accountId: '',
    category: '',
    active: true,
  }
  let candidate = normalized.nextChargeDate
  while (candidate < today) {
    const next = advanceSubscriptionDate({ ...normalized, nextChargeDate: candidate })
    if (next <= candidate) {
      return today
    }
    candidate = next
  }
  return candidate
}

export function materializeDueSubscriptions(state: State, today: string): DueSubscriptionsResult {
  let generatedCount = 0
  let advancedCount = 0

  state.subscriptions.forEach((subscription) => {
    const accountExists = state.accounts.some((account) => account.id === subscription.accountId)
    if (!subscription.active || !accountExists) {
      return
    }

    while (subscription.nextChargeDate <= today) {
      const chargeDate = subscription.nextChargeDate
      const alreadyExists = state.transactions.some(
        (transaction) =>
          transaction.subscriptionId === subscription.id &&
          transaction.subscriptionChargeDate === chargeDate,
      )
      if (!alreadyExists) {
        state.transactions.push({
          id: uid('tx'),
          date: chargeDate,
          month: monthFromISO(chargeDate) ?? 0,
          type: 'expense',
          accountId: subscription.accountId,
          category: subscription.category,
          description: subscription.name,
          amount: round2(subscription.amount),
          subscriptionId: subscription.id,
          subscriptionChargeDate: chargeDate,
        })
        generatedCount += 1
      }

      const nextChargeDate = advanceSubscriptionDate(subscription)
      if (nextChargeDate <= subscription.nextChargeDate) {
        break
      }
      subscription.nextChargeDate = nextChargeDate
      advancedCount += 1
    }
  })

  return { generatedCount, advancedCount }
}
