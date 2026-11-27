// The market indices the portfolio is compared with on the Inversión cover.
// Each one is read through a euro-listed accumulating ETF that tracks it, so
// its monthly closes already carry the dividends and the currency the
// portfolio is measured in. The IBEX 35 has no such ETF and is read as the
// price index.

export interface Benchmark {
  id: string
  name: string
  /** Yahoo Finance symbol whose monthly closes stand for the index. */
  symbol: string
}

export const BENCHMARKS: readonly Benchmark[] = [
  { id: 'msci-world', name: 'MSCI World', symbol: 'EUNL.DE' },
  { id: 'sp-500', name: 'S&P 500', symbol: 'SXR8.DE' },
  { id: 'ibex-35', name: 'IBEX 35', symbol: '^IBEX' },
  { id: 'nasdaq-100', name: 'Nasdaq 100', symbol: 'SXRV.DE' },
  { id: 'stoxx-600', name: 'Stoxx 600', symbol: 'EXSA.DE' },
]

export const DEFAULT_BENCHMARK = BENCHMARKS[0].id

export const findBenchmark = (id: string): Benchmark | undefined =>
  BENCHMARKS.find((benchmark) => benchmark.id === id)

/**
 * What the money that went into the portfolio would be worth in the index,
 * put in on the same months. `value` and `invested` are the portfolio's series
 * (the year's opening point, then each month close); `closes` are the index's
 * closes on the same points. The index starts at the portfolio's opening value
 * and each month grows by the index's own change and takes that month's
 * contributions (or gives back its withdrawals) at the close. Points the index
 * has no close for are left out, so the result can be shorter than `value`.
 */
export function sameMoneyInIndex(
  value: readonly number[],
  invested: readonly number[],
  closes: readonly number[],
): number[] {
  const count = Math.min(value.length, invested.length, closes.length)
  if (!count) return []
  const series = [value[0]]
  for (let index = 1; index < count; index++) {
    const growth = closes[index - 1] > 0 ? closes[index] / closes[index - 1] : 1
    const flow = invested[index] - invested[index - 1]
    series.push(series[index - 1] * growth + flow)
  }
  return series
}

/** The index's cumulative return from the first close, in percent (17.5 for +17.5 %). */
export function cumulativeReturn(closes: readonly number[]): number[] {
  const base = closes[0]
  return base > 0 ? closes.map((close) => (close / base - 1) * 100) : []
}
