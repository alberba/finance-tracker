import { Effect } from 'effect'

import type { Benchmark } from '../../domain/investment/benchmarks'
import { yahooQuoteSymbol } from '../../domain/investment/symbol-matching'
import type { Instrument } from '../../scripts/types'
import { MarketQuoteError } from './market-data'
import { yahooFinance } from './yahoo-finance'

// Monthly closes of a market index for one year, from Yahoo Finance: the close
// of the previous December (the year's opening point), then each month close
// up to the current month, whose close is the latest price. They change at most
// once a day for past months, so they are kept in memory for a few hours.

const TTL_MS = 6 * 60 * 60 * 1000
const cache = new Map<string, { at: number; closes: number[] }>()

export function loadBenchmarkCloses(
  benchmark: Benchmark,
  year: number,
): Effect.Effect<number[], MarketQuoteError> {
  return loadYahooCloses(benchmark.symbol, benchmark.name, year)
}

/** The same closes for an instrument's own quote, for the evolution of its position. */
export function loadInstrumentCloses(
  instrument: Pick<Instrument, 'symbol' | 'quoteSymbol' | 'type' | 'currency'>,
  year: number,
): Effect.Effect<number[], MarketQuoteError> {
  return loadYahooCloses(yahooQuoteSymbol(instrument), instrument.symbol, year)
}

function loadYahooCloses(
  symbol: string,
  name: string,
  year: number,
): Effect.Effect<number[], MarketQuoteError> {
  const key = `${symbol}:${year}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return Effect.succeed(hit.closes)

  return Effect.tryPromise({
    try: () =>
      yahooFinance.chart(symbol, {
        period1: `${year - 1}-12-01`,
        period2: `${year + 1}-01-01`,
        interval: '1mo',
      }),
    catch: () => new MarketQuoteError({ message: `No se pudo consultar ${name}.` }),
  }).pipe(
    Effect.map((result) => monthlyCloses(result.quotes, year)),
    Effect.tap((closes) => Effect.sync(() => cache.set(key, { at: Date.now(), closes }))),
  )
}

interface ChartBar {
  date: Date
  close: number | null
  adjclose?: number | null
}

/**
 * One close per month, December of the previous year first. Yahoo dates each
 * monthly bar at the start of its month in the exchange's time zone, which can
 * fall on the last day of the previous month in UTC; a few hours forward puts
 * it back in its month. A month without a close ends the series.
 */
export function monthlyCloses(bars: readonly ChartBar[], year: number): number[] {
  const byMonth = new Map<number, number>()
  for (const bar of bars) {
    const close = bar.adjclose ?? bar.close
    if (close === null || close === undefined || !Number.isFinite(close)) continue
    const date = new Date(bar.date.getTime() + 12 * 60 * 60 * 1000)
    const index = (date.getUTCFullYear() - year) * 12 + date.getUTCMonth() + 1
    if (index >= 0 && index <= 12) byMonth.set(index, close)
  }
  const closes: number[] = []
  for (let index = 0; byMonth.has(index); index++) closes.push(byMonth.get(index)!)
  return closes
}
