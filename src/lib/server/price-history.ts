/**
 * A symbol's quote history for its chart: Yahoo first, every range, the
 * one-day one every five minutes; Morningstar backs funds up with a close a day.
 *
 * Each result is kept in memory for a while (`ttlMs`) so a chart opened by
 * several tabs, or reopened, does not hit Yahoo again: a one-day chart is
 * already about 15 minutes late on European exchanges, so 90 seconds more
 * costs nothing and keeps clear of Yahoo's 429.
 */

import { Effect } from 'effect'

import type { PriceHistory, PricePoint, PriceRange } from '../../domain/investment/price-history'
import { yahooQuoteSymbol } from '../../domain/investment/symbol-matching'
import type { InstrumentQuoteSource } from '../../scripts/types'
import { Http } from './http'
import { MarketQuoteError } from './market-data'
import { fetchMorningstarCloses, morningstarId } from './morningstar'
import { yahooFinance } from './yahoo-finance'

interface RangeSpec {
  interval: '5m' | '30m' | '1d' | '1wk'
  /** How far back to ask, in days. The one-day range asks for a few to find the last session. */
  days: number
  ttlMs: number
}

const DAY_MS = 24 * 60 * 60 * 1000

const RANGE_SPECS: Record<PriceRange, RangeSpec> = {
  '1d': { interval: '5m', days: 5, ttlMs: 90_000 },
  '5d': { interval: '30m', days: 7, ttlMs: 5 * 60_000 },
  '1mo': { interval: '1d', days: 31, ttlMs: 30 * 60_000 },
  '6mo': { interval: '1d', days: 183, ttlMs: 30 * 60_000 },
  '1y': { interval: '1d', days: 366, ttlMs: 30 * 60_000 },
  '5y': { interval: '1wk', days: 5 * 366, ttlMs: 6 * 60 * 60_000 },
}

const cache = new Map<string, { expiresAt: number; history: PriceHistory }>()

export function loadPriceHistory(
  instrument: InstrumentQuoteSource,
  range: PriceRange,
  now: Date = new Date(),
): Effect.Effect<PriceHistory, MarketQuoteError, Http> {
  const ticker = yahooQuoteSymbol(instrument)
  const key = `${ticker}:${range}`
  const hit = cache.get(key)
  if (hit && hit.expiresAt > now.getTime()) return Effect.succeed(hit.history)

  const spec = RANGE_SPECS[range]
  const fund = range === '1d' ? null : morningstarId(instrument)
  const fromYahoo = loadYahooHistory(ticker, range, spec, now)
  const history = fund
    ? fromYahoo.pipe(
        Effect.catch(() =>
          fetchMorningstarCloses(
            fund,
            isoDate(new Date(now.getTime() - spec.days * DAY_MS)),
            range === '5y' ? 'weekly' : 'daily',
          ).pipe(
            Effect.map((points) => fromCloses(range, 'EUR', points, 'morningstar')),
            Effect.mapError((error) => new MarketQuoteError({ message: error.message })),
          ),
        ),
      )
    : fromYahoo
  return history.pipe(
    Effect.tap((loaded) =>
      Effect.sync(() => cache.set(key, { expiresAt: now.getTime() + spec.ttlMs, history: loaded })),
    ),
  )
}

/** Forgets every cached history (tests). */
export function clearPriceHistoryCache(): void {
  cache.clear()
}

interface ChartBar {
  date: Date
  close: number | null
}

function loadYahooHistory(
  ticker: string,
  range: PriceRange,
  spec: RangeSpec,
  now: Date,
): Effect.Effect<PriceHistory, MarketQuoteError> {
  return Effect.tryPromise({
    try: () =>
      yahooFinance.chart(ticker, {
        period1: new Date(now.getTime() - spec.days * DAY_MS),
        interval: spec.interval,
      }),
    catch: () => new MarketQuoteError({ message: `No se pudo consultar ${ticker} en Yahoo.` }),
  }).pipe(
    Effect.flatMap((result) => {
      const currency = String(result.meta.currency || '')
      const scale = currency === 'GBp' || currency === 'GBX' ? 0.01 : 1
      const points = toPoints(result.quotes, scale)
      const history =
        range === '1d'
          ? lastSession(points, result.meta.gmtoffset ?? 0, normalizeCurrency(currency))
          : fromCloses(range, normalizeCurrency(currency), points, 'yahoo')
      return history.points.length
        ? Effect.succeed(history)
        : Effect.fail(new MarketQuoteError({ message: `Yahoo no tiene histórico de ${ticker}.` }))
    }),
  )
}

function toPoints(bars: readonly ChartBar[], scale: number): PricePoint[] {
  const points: PricePoint[] = []
  for (const bar of bars) {
    if (bar.close === null || !Number.isFinite(bar.close)) continue
    points.push({ t: bar.date.getTime(), close: bar.close * scale })
  }
  return points
}

/**
 * The bars of the newest session, by the exchange's calendar day (`gmtoffset`
 * seconds from UTC), with the close before it as the day's reference. Out of
 * hours it is still the last session, as Yahoo shows it.
 */
export function lastSession(
  points: readonly PricePoint[],
  gmtoffsetSeconds: number,
  currency: string,
): PriceHistory {
  const day = (t: number) => Math.floor((t + gmtoffsetSeconds * 1000) / DAY_MS)
  const last = points.at(-1)
  const session = last ? points.filter((point) => day(point.t) === day(last.t)) : []
  const before = last ? points.filter((point) => day(point.t) < day(last.t)).at(-1) : undefined
  return {
    range: '1d',
    currency,
    intraday: true,
    previousClose: before?.close ?? null,
    points: session,
    source: 'yahoo',
  }
}

/**
 * A daily or weekly series: the first close is the period's reference and the
 * rest are drawn, so a one-month chart measures its change against the close
 * the month started from.
 */
function fromCloses(
  range: PriceRange,
  currency: string,
  points: readonly PricePoint[],
  source: PriceHistory['source'],
): PriceHistory {
  return {
    range,
    currency,
    intraday: range === '5d',
    previousClose: points[0]?.close ?? null,
    points: [...points],
    source,
  }
}

function normalizeCurrency(currency: string): string {
  if (currency === 'GBp' || currency === 'GBX') return 'GBP'
  return currency.toUpperCase().slice(0, 3) || 'EUR'
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
