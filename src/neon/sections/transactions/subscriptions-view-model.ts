import {
  buildSubscriptionAnalysis,
  monthlyEquivalent,
  projectSubscriptionCharges,
} from '../../../domain/subscriptions/analysis'
import { formatDayMonth, formatMoney } from '../../../lib/format'
import { round2 } from '../../../lib/number'
import type { Subscription, SubscriptionFrequency } from '../../../scripts/types'

// What the new «Suscripciones» tab shows (artboard «Movimientos», second
// tab): a table that compares them by what they cost per month and, in the
// aside, the monthly commitment, the charges of the next 12 months and the
// next charge of each. Pure functions over the shared analysis.

export const FREQUENCY_OPTIONS: ReadonlyArray<{ value: SubscriptionFrequency; label: string }> = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
]

const FREQUENCY_LABEL = Object.fromEntries(
  FREQUENCY_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<SubscriptionFrequency, string>

const CHARGE_CADENCE: Record<SubscriptionFrequency, string> = {
  weekly: 'a la semana',
  monthly: '',
  quarterly: 'cada trimestre',
  yearly: 'al año',
}

export interface SubscriptionRowView {
  id: string
  name: string
  /** «Ocio · Revolut». */
  meta: string
  frequency: string
  /** What each charge costs. */
  amount: string
  /** The actual charge when its frequency differs from the monthly equivalent. */
  periodicCharge: string
  /** What it amounts to per month, the column that makes them comparable. */
  monthly: string
  /** «18 dic», or «—» when paused or without a date. */
  next: string
  /** «en 21 días», «en 8 meses», or empty. */
  when: string
  active: boolean
}

// Far enough to reach the next charge of a yearly subscription whose stored
// date fell behind.
const NEXT_CHARGE_HORIZON_DAYS = 400

/**
 * One row per subscription: the active ones by what they cost per month
 * (largest first), then the paused ones by name.
 */
export function subscriptionRows(
  subscriptions: Subscription[],
  accountName: (id: string) => string,
  today: string,
  currency = 'EUR',
): SubscriptionRowView[] {
  const horizon = addDays(today, NEXT_CHARGE_HORIZON_DAYS)
  return subscriptions
    .toSorted(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        (a.active ? monthlyEquivalent(b) - monthlyEquivalent(a) : 0) ||
        a.name.localeCompare(b.name, 'es'),
    )
    .map((subscription) => {
      const charge = subscription.active
        ? projectSubscriptionCharges([subscription], today, horizon)[0]
        : undefined
      const amount = formatMoney(subscription.amount, currency)
      const cadence = CHARGE_CADENCE[subscription.frequency]
      return {
        id: subscription.id,
        name: subscription.name,
        meta: `${subscription.category} · ${accountName(subscription.accountId)}`,
        frequency: FREQUENCY_LABEL[subscription.frequency],
        amount,
        periodicCharge: cadence ? `${amount} ${cadence}` : '',
        monthly: formatMoney(monthlyEquivalent(subscription), currency),
        next: charge ? formatDayMonth(charge.date) : '—',
        when: charge ? inTime(charge.daysUntilCharge) : '',
        active: subscription.active,
      }
    })
}

/** «hoy», «mañana», «en 23 días», «en 8 meses». */
export function inTime(days: number): string {
  if (days === 0) return 'hoy'
  if (days === 1) return 'mañana'
  if (days < 45) return `en ${days} días`
  return `en ${Math.round(days / 30.44)} meses`
}

export interface UpcomingView {
  id: string
  date: string
  name: string
  when: string
  amount: string
}

export interface MonthChargesView {
  /** «2026-12». */
  key: string
  /** «dic». */
  label: string
  /** «Diciembre de 2026: 9,16 €», for the bar's name. */
  title: string
  amount: string
  /** Its height against the dearest month, 0–1. */
  height: number
  /** Highlights the highest bars when months differ. */
  peak: boolean
}

export interface SubscriptionsSummary {
  monthly: string
  annual: string
  /** «289,89 € al año · 5 activas». */
  line: string
  /** «Dejas de pagar 258,00 € al año», or empty without paused ones. */
  paused: string
  /** What the active ones charge in each of the next 12 months, this one first. */
  months: MonthChargesView[]
  /** Labels the first bar when it covers only the remaining days of this month. */
  partialMonth: string
  /** The upcoming charges in date order, including repeats. */
  upcoming: UpcomingView[]
}

const MONTH_LABELS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]
const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]
const UPCOMING_SHOWN = 4

export function subscriptionsSummary(
  subscriptions: Subscription[],
  today: string,
  currency = 'EUR',
): SubscriptionsSummary {
  const analysis = buildSubscriptionAnalysis(subscriptions, today)
  const active = subscriptions.filter((subscription) => subscription.active)
  const [year, month, day] = today.split('-').map(Number)
  // From today to the last day of the eleventh month after this one.
  const lastDay = new Date(Date.UTC(year, month + 11, 0)).toISOString().slice(0, 10)
  const charges = projectSubscriptionCharges(active, today, lastDay)

  const totals = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1))
    const key = date.toISOString().slice(0, 7)
    const total = charges
      .filter((charge) => charge.date.startsWith(key))
      .reduce((sum, charge) => sum + charge.amount, 0)
    return {
      key,
      monthIndex: date.getUTCMonth(),
      year: date.getUTCFullYear(),
      total: round2(total),
    }
  })
  const max = Math.max(...totals.map((item) => item.total))
  const min = Math.min(...totals.map((item) => item.total))

  const partialMonth = day > 1 ? `Resto de ${MONTH_NAMES[month - 1].toLowerCase()}` : ''

  return {
    monthly: formatMoney(analysis.monthlyCommitment, currency),
    annual: formatMoney(analysis.annualCommitment, currency),
    line: `${formatMoney(analysis.annualCommitment, currency)} al año · ${analysis.activeCount} ${analysis.activeCount === 1 ? 'activa' : 'activas'}`,
    paused: analysis.pausedCount
      ? `Dejas de pagar ${formatMoney(analysis.pausedAnnualAmount, currency)} al año`
      : '',
    partialMonth,
    months: totals.map((item, index) => {
      const amount = formatMoney(item.total, currency)
      const name = index === 0 && partialMonth ? partialMonth : MONTH_NAMES[item.monthIndex]
      return {
        key: item.key,
        label: MONTH_LABELS[item.monthIndex],
        title: `${name} de ${item.year}: ${amount}`,
        amount,
        height: max > 0 ? item.total / max : 0,
        peak: max > min && item.total === max,
      }
    }),
    upcoming: charges.slice(0, UPCOMING_SHOWN).map((charge) => ({
      id: charge.id,
      date: formatDayMonth(charge.date),
      name: charge.name,
      when: inTime(charge.daysUntilCharge),
      amount: formatMoney(charge.amount, currency),
    })),
  }
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
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
