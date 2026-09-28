import type { InstrumentValuation } from './valuation'

export type QuoteState = InstrumentValuation['status']

/** Tone of a status: maps to the gain / warning / loss colors of the theme. */
export type StatusTone = 'gain' | 'warn' | 'loss'

/** The one place a quote status becomes words and a tone. */
export const QUOTE_STATUS: Record<QuoteState, { label: string; tone: StatusTone }> = {
  fresh: { label: 'Actualizado', tone: 'gain' },
  stale: { label: 'Retrasado', tone: 'warn' },
  unavailable: { label: 'Sin cotización', tone: 'loss' },
}

export interface QuoteStatusSummary {
  status: 'fresh' | 'stale'
  label: string
  tone: StatusTone
  /** Most recent quote timestamp, ISO. */
  latest: string
}

/**
 * Status of the portfolio's quotes as a whole: up to date only when every
 * quote is fresh. Instruments without a quote are not late, just missing (their
 * row says so), so they don't count. `null` when no instrument has a quote.
 */
export function summarizeQuoteStatus(
  valuations: ReadonlyArray<Pick<InstrumentValuation, 'status' | 'quote'>>,
): QuoteStatusSummary | null {
  const stamps = valuations
    .map((row) => (row.quote ? Date.parse(row.quote.timestamp) : Number.NaN))
    .filter((stamp) => Number.isFinite(stamp))
  if (!stamps.length) return null
  const fresh = valuations.every((row) => row.status !== 'stale')
  return {
    status: fresh ? 'fresh' : 'stale',
    label: fresh ? 'Cotizaciones actualizadas' : 'Cotizaciones retrasadas',
    tone: fresh ? QUOTE_STATUS.fresh.tone : QUOTE_STATUS.stale.tone,
    latest: new Date(Math.max(...stamps)).toISOString(),
  }
}
