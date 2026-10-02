import { round2 } from '../../lib/number'
import type { Subscription, SubscriptionFrequency } from '../../scripts/types'

const FREQUENCIES: Array<{
  frequency: SubscriptionFrequency
  label: string
  annualOccurrences: number
}> = [
  { frequency: 'weekly', label: 'Semanal', annualOccurrences: 52 },
  { frequency: 'monthly', label: 'Mensual', annualOccurrences: 12 },
  { frequency: 'quarterly', label: 'Trimestral', annualOccurrences: 4 },
  { frequency: 'yearly', label: 'Anual', annualOccurrences: 1 },
]

const ANNUAL_OCCURRENCES = Object.fromEntries(
  FREQUENCIES.map(({ frequency, annualOccurrences }) => [frequency, annualOccurrences]),
) as Record<SubscriptionFrequency, number>

export interface SubscriptionFrequencyAnalysis {
  frequency: SubscriptionFrequency
  label: string
  activeCount: number
  monthlyEquivalent: number
  annualTotal: number
}

export interface BasicSubscriptionAnalysis {
  activeCount: number
  monthlyEquivalent: number
  annualTotal: number
  byFrequency: SubscriptionFrequencyAnalysis[]
}

export interface SubscriptionBreakdownRow {
  label: string
  monthlyAmount: number
  annualAmount: number
  share: number
}

export interface SubscriptionCostRow {
  id: string
  name: string
  category: string
  monthlyAmount: number
  annualAmount: number
  nextChargeDate: string
}

export interface UpcomingSubscriptionCharge {
  id: string
  name: string
  date: string
  amount: number
  daysUntilCharge: number
}

export interface SubscriptionAnalysis {
  activeCount: number
  pausedCount: number
  monthlyCommitment: number
  annualCommitment: number
  pausedAnnualAmount: number
  next30DaysAmount: number
  categoryBreakdown: SubscriptionBreakdownRow[]
  accountBreakdown: SubscriptionBreakdownRow[]
  topCosts: SubscriptionCostRow[]
  upcomingCharges: UpcomingSubscriptionCharge[]
}

export function analyzeSubscriptions(subscriptions: Subscription[]): BasicSubscriptionAnalysis {
  const activeSubscriptions = subscriptions.filter((subscription) => subscription.active)
  const byFrequency = FREQUENCIES.flatMap(({ frequency, label, annualOccurrences }) => {
    const matching = activeSubscriptions.filter(
      (subscription) => subscription.frequency === frequency,
    )
    if (!matching.length) return []
    const annualTotal = round2(
      matching.reduce((total, subscription) => total + subscription.amount, 0) *
        annualOccurrences,
    )
    return [{
      frequency,
      label,
      activeCount: matching.length,
      monthlyEquivalent: round2(annualTotal / 12),
      annualTotal,
    }]
  })
  const annualTotal = round2(byFrequency.reduce((sum, row) => sum + row.annualTotal, 0))
  return {
    activeCount: activeSubscriptions.length,
    monthlyEquivalent: round2(annualTotal / 12),
    annualTotal,
    byFrequency,
  }
}

export function annualizeSubscription(subscription: Subscription): number {
  return round2(subscription.amount * ANNUAL_OCCURRENCES[subscription.frequency])
}

export function monthlyEquivalent(subscription: Subscription): number {
  return round2(annualizeSubscription(subscription) / 12)
}

export function buildSubscriptionAnalysis(
  subscriptions: Subscription[],
  todayIso: string,
): SubscriptionAnalysis {
  const active = subscriptions.filter((subscription) => subscription.active)
  const paused = subscriptions.filter((subscription) => !subscription.active)
  const annualCommitment = round2(
    active.reduce((sum, subscription) => sum + annualizeSubscription(subscription), 0),
  )
  const upcomingCharges = buildUpcomingCharges(active, todayIso)

  return {
    activeCount: active.length,
    pausedCount: paused.length,
    monthlyCommitment: round2(annualCommitment / 12),
    annualCommitment,
    pausedAnnualAmount: round2(
      paused.reduce((sum, subscription) => sum + annualizeSubscription(subscription), 0),
    ),
    next30DaysAmount: round2(upcomingCharges.reduce((sum, charge) => sum + charge.amount, 0)),
    categoryBreakdown: buildBreakdown(active, (subscription) => subscription.category),
    accountBreakdown: buildBreakdown(active, (subscription) => subscription.accountId),
    topCosts: active
      .map((subscription) => ({
        id: subscription.id,
        name: subscription.name,
        category: subscription.category,
        monthlyAmount: monthlyEquivalent(subscription),
        annualAmount: annualizeSubscription(subscription),
        nextChargeDate: subscription.nextChargeDate,
      }))
      .sort((a, b) => b.annualAmount - a.annualAmount || a.name.localeCompare(b.name))
      .slice(0, 5),
    upcomingCharges: upcomingCharges.slice(0, 5),
  }
}

function buildBreakdown(
  subscriptions: Subscription[],
  labelFor: (subscription: Subscription) => string,
): SubscriptionBreakdownRow[] {
  const annualByLabel = new Map<string, number>()
  subscriptions.forEach((subscription) => {
    const label = labelFor(subscription).trim() || 'Sin clasificar'
    annualByLabel.set(label, (annualByLabel.get(label) || 0) + annualizeSubscription(subscription))
  })
  const total = Array.from(annualByLabel.values()).reduce((sum, amount) => sum + amount, 0)
  return Array.from(annualByLabel, ([label, annualAmount]) => ({
    label,
    annualAmount: round2(annualAmount),
    monthlyAmount: round2(annualAmount / 12),
    share: total > 0 ? annualAmount / total : 0,
  })).sort((a, b) => b.annualAmount - a.annualAmount || a.label.localeCompare(b.label))
}

function buildUpcomingCharges(
  subscriptions: Subscription[],
  todayIso: string,
): UpcomingSubscriptionCharge[] {
  const start = parseIsoDate(todayIso)
  if (!start) return []
  const end = addUtcDays(start, 30)

  return subscriptions
    .flatMap((subscription) => {
      const firstCharge = parseIsoDate(subscription.nextChargeDate)
      if (!firstCharge) return []
      const charges: UpcomingSubscriptionCharge[] = []
      let chargeDate = firstCharge
      while (chargeDate < start) chargeDate = nextOccurrence(chargeDate, subscription.frequency)
      while (chargeDate <= end) {
        const date = chargeDate.toISOString().slice(0, 10)
        charges.push({
          id: `${subscription.id}:${date}`,
          name: subscription.name,
          date,
          amount: round2(subscription.amount),
          daysUntilCharge: utcDayNumber(chargeDate) - utcDayNumber(start),
        })
        chargeDate = nextOccurrence(chargeDate, subscription.frequency)
      }
      return charges
    })
    .sort((a, b) => a.daysUntilCharge - b.daysUntilCharge || a.name.localeCompare(b.name))
}

function nextOccurrence(date: Date, frequency: SubscriptionFrequency): Date {
  const next = new Date(date)
  if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + 7)
  else if (frequency === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1)
  else if (frequency === 'quarterly') next.setUTCMonth(next.getUTCMonth() + 3)
  else next.setUTCFullYear(next.getUTCFullYear() + 1)
  return next
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function utcDayNumber(date: Date): number {
  return Math.floor(date.getTime() / 86_400_000)
}
