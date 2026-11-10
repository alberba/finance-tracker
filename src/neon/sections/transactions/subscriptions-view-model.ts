import {
  buildSubscriptionAnalysis,
  monthlyEquivalent,
} from '../../../domain/subscriptions/analysis'
import { formatDayMonth, formatMoney } from '../../../lib/format'
import type { Subscription, SubscriptionFrequency } from '../../../scripts/types'

// What the new «Suscripciones» tab shows (artboard «Movimientos», second
// tab): one row per subscription and, in the aside, the monthly commitment and
// the next 30 days of charges. Pure functions over the shared analysis.

export const FREQUENCY_OPTIONS: ReadonlyArray<{ value: SubscriptionFrequency; label: string }> = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
]

const FREQUENCY_LABEL = Object.fromEntries(
  FREQUENCY_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<SubscriptionFrequency, string>

export interface SubscriptionRowView {
  id: string
  name: string
  meta: string
  amount: string
  status: string
  active: boolean
}

export function subscriptionRows(
  subscriptions: Subscription[],
  accountName: (id: string) => string,
  currency = 'EUR',
): SubscriptionRowView[] {
  return [...subscriptions]
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es'))
    .map((subscription) => ({
      id: subscription.id,
      name: subscription.name,
      meta: `${subscription.category} · ${accountName(subscription.accountId)} · ${FREQUENCY_LABEL[subscription.frequency]}`,
      amount: formatMoney(subscription.amount, currency),
      status: subscription.active
        ? subscription.nextChargeDate
          ? `Activa · próximo ${formatDayMonth(subscription.nextChargeDate)}`
          : 'Activa'
        : 'Pausada',
      active: subscription.active,
    }))
}

/** «hoy», «mañana», «en 23 días». */
export function inDays(days: number): string {
  if (days === 0) return 'hoy'
  if (days === 1) return 'mañana'
  return `en ${days} días`
}

export interface UpcomingView {
  id: string
  date: string
  name: string
  when: string
  amount: string
}

export interface SubscriptionsSummary {
  monthly: string
  /** «Proyección anual 1.234,00 € · 6 activas». */
  line: string
  /** «3 cobros · 45,97 €», or «sin cobros». */
  next30: string
  upcoming: UpcomingView[]
}

export function subscriptionsSummary(
  subscriptions: Subscription[],
  today: string,
  currency = 'EUR',
): SubscriptionsSummary {
  const analysis = buildSubscriptionAnalysis(subscriptions, today)
  const count = analysis.next30DaysCount
  return {
    monthly: formatMoney(analysis.monthlyCommitment, currency),
    line: `Proyección anual ${formatMoney(analysis.annualCommitment, currency)} · ${analysis.activeCount} ${analysis.activeCount === 1 ? 'activa' : 'activas'}`,
    next30: count
      ? `${count} ${count === 1 ? 'cobro' : 'cobros'} · ${formatMoney(analysis.next30DaysAmount, currency)}`
      : 'sin cobros',
    upcoming: analysis.upcomingCharges.map((charge) => ({
      id: charge.id,
      date: formatDayMonth(charge.date),
      name: charge.name,
      when: inDays(charge.daysUntilCharge),
      amount: formatMoney(charge.amount, currency),
    })),
  }
}

export interface SubscriptionDetailField {
  label: string
  value: string
}

/** The fields of one subscription's detail. */
export function subscriptionFields(
  subscription: Subscription,
  accountName: (id: string) => string,
  currency = 'EUR',
): SubscriptionDetailField[] {
  return [
    { label: 'Importe', value: formatMoney(subscription.amount, currency) },
    { label: 'Frecuencia', value: FREQUENCY_LABEL[subscription.frequency] },
    { label: 'Al mes', value: formatMoney(monthlyEquivalent(subscription), currency) },
    { label: 'Cuenta', value: accountName(subscription.accountId) },
    { label: 'Categoría', value: subscription.category },
    {
      label: 'Próximo cobro',
      value:
        subscription.active && subscription.nextChargeDate
          ? formatDayMonth(subscription.nextChargeDate)
          : '—',
    },
  ]
}
