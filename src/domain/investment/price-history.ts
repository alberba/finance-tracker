import type { InstrumentType } from '../../scripts/types'

/** The periods a symbol's quote chart can show, shortest first. */
export const PRICE_RANGES = ['1d', '5d', '1mo', '6mo', '1y', '5y'] as const
export type PriceRange = (typeof PRICE_RANGES)[number]

export const PRICE_RANGE_LABELS: Record<PriceRange, string> = {
  '1d': '1D',
  '5d': '1S',
  '1mo': '1M',
  '6mo': '6M',
  '1y': '1A',
  '5y': '5A',
}

/** One close of the series: `t` in epoch milliseconds, `close` in `PriceHistory.currency`. */
export interface PricePoint {
  t: number
  close: number
}

export interface PriceHistory {
  range: PriceRange
  currency: string
  /** `true` when the points are minutes apart (one session), `false` for one point per day or week. */
  intraday: boolean
  /** The close before the first point, to measure the period's change; null when unknown. */
  previousClose: number | null
  points: PricePoint[]
  source: 'yahoo' | 'morningstar'
}

/**
 * A fund has one price a day (its net asset value), so it has no one-day chart:
 * no source can draw a session that does not exist.
 */
export function priceRangesFor(type: InstrumentType): readonly PriceRange[] {
  return type === 'fund' ? PRICE_RANGES.filter((range) => range !== '1d') : PRICE_RANGES
}

export function isPriceRange(value: unknown): value is PriceRange {
  return typeof value === 'string' && (PRICE_RANGES as readonly string[]).includes(value)
}
