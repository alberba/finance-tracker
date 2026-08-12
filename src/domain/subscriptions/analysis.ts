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

export interface SubscriptionFrequencyAnalysis {
  frequency: SubscriptionFrequency
  label: string
  activeCount: number
  monthlyEquivalent: number
  annualTotal: number
}

export interface SubscriptionAnalysis {
  activeCount: number
  monthlyEquivalent: number
  annualTotal: number
  byFrequency: SubscriptionFrequencyAnalysis[]
}

export function analyzeSubscriptions(subscriptions: Subscription[]): SubscriptionAnalysis {
  const activeSubscriptions = subscriptions.filter((subscription) => subscription.active)
  const byFrequency = FREQUENCIES.flatMap(({ frequency, label, annualOccurrences }) => {
    const matchingSubscriptions = activeSubscriptions.filter(
      (subscription) => subscription.frequency === frequency,
    )
    if (!matchingSubscriptions.length) return []

    const amountPerOccurrence = matchingSubscriptions.reduce(
      (total, subscription) => total + subscription.amount,
      0,
    )
    const annualTotal = round2(amountPerOccurrence * annualOccurrences)

    return [
      {
        frequency,
        label,
        activeCount: matchingSubscriptions.length,
        monthlyEquivalent: round2(annualTotal / 12),
        annualTotal,
      },
    ]
  })
  const annualTotal = round2(
    byFrequency.reduce((total, frequency) => total + frequency.annualTotal, 0),
  )

  return {
    activeCount: activeSubscriptions.length,
    monthlyEquivalent: round2(annualTotal / 12),
    annualTotal,
    byFrequency,
  }
}
