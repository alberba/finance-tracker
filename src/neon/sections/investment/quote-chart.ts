import type { PriceHistory } from '../../../domain/investment/price-history'
import { formatCompactMoney, formatPercent, formatQuotePrice } from '../../../lib/format'
import { buildLineChart, type LabelledLineChart } from '../../ui/line-chart'

const TIME_ZONE = 'Europe/Madrid'
const hour = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIME_ZONE,
})
const dayMonth = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  timeZone: TIME_ZONE,
})
const monthYear = new Intl.DateTimeFormat('es-ES', {
  month: 'short',
  year: '2-digit',
  timeZone: TIME_ZONE,
})
const weekdayHour = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIME_ZONE,
})
const longDay = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: TIME_ZONE,
})

/**
 * The symbol's quote over its range as the evolution chart draws it: the hours
 * under a one-day chart, the days under a week or a month, the months beyond.
 */
export function quoteLineChart(history: PriceHistory): LabelledLineChart {
  const values = history.points.map((point) => point.close)
  const geometry = buildLineChart(values)
  const axis =
    history.range === '1d'
      ? hour
      : history.range === '5d' || history.range === '1mo'
        ? dayMonth
        : monthYear
  const reading = history.range === '1d' ? hour : history.range === '5d' ? weekdayHour : longDay
  const price = (value: number) => formatQuotePrice(round(value), history.currency)
  const first = history.points[0]
  const last = history.points.at(-1)
  return {
    ...geometry,
    labels: history.points.map((point) => axis.format(point.t).replace('.', '')),
    tickLabels: geometry.ticks.map((tick) => formatCompactMoney(tick.value, history.currency)),
    readings: history.points.map((point) => ({
      name: reading.format(point.t).replace('.', ''),
      value: price(point.close),
    })),
    label:
      first && last
        ? `Cotización de ${reading.format(first.t)} a ${reading.format(last.t)}: de ${price(first.close)} a ${price(last.close)}`
        : 'Cotización: sin datos',
  }
}

/** «+1,78 %» over the range, against the close before it; null without one. */
export function quoteRangeChange(
  history: PriceHistory,
  index = history.points.length - 1,
): { text: string; tone: 'gain' | 'loss' | 'neutral' } | null {
  const point = history.points[index]
  const base = history.previousClose
  if (!point || !base) return null
  const change = ((point.close - base) / base) * 100
  const tone = Math.abs(change) < 0.005 ? 'neutral' : change > 0 ? 'gain' : 'loss'
  return { text: formatPercent(change, { signed: true }), tone }
}

/** Four significant decimals at most: a fund's 63,4458 €, a share's 10,90 €. */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
