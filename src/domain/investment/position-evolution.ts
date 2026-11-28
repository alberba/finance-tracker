import type { State } from '../../scripts/types'
import { buildAccountPositions } from './positions'
import { getExchangeRate } from './valuation'

// Evolución de cada posición de una cuenta, mes a mes (#563): los títulos a fin
// de mes por el cierre mensual del instrumento. Sin histórico de cotización el
// valor sale del reparto del cierre de la cuenta según lo invertido, el mismo
// que usa `buildAccountPositions` para una posición sin precio.

export interface PositionEvolution {
  instrumentId: string
  symbol: string
  /** Value in the base currency at each close: index 0 the opening point, index n month n. */
  values: number[]
  /** Every month is valued with the instrument's closes; otherwise some are a share of the account. */
  priced: boolean
}

export interface EvolutionOptions {
  fxRates?: Record<string, number>
}

/**
 * The evolution of every position the account has held up to `throughMonth`.
 *
 * `closes` are the instruments' monthly closes by instrument id, in the
 * instrument's currency, in the layout of an index's closes: the previous
 * December first, then each month of the year. A month without a close (or an
 * instrument without history) is valued by the share of the account's value;
 * a month with no units is worth zero.
 */
export function buildPositionEvolution(
  state: State,
  accountId: string,
  throughMonth: number,
  closes: Record<string, readonly number[]>,
  options: EvolutionOptions = {},
): PositionEvolution[] {
  const baseCurrency = String(state.currency || 'EUR').toUpperCase()
  const evolution = new Map<string, PositionEvolution>()

  for (let month = 0; month <= throughMonth; month++) {
    const unitPrices: Record<string, number> = {}
    for (const [instrumentId, series] of Object.entries(closes)) {
      const close = series[month]
      if (!Number.isFinite(close)) continue
      const currency = state.instruments.find((item) => item.id === instrumentId)?.currency
      unitPrices[instrumentId] =
        close * getExchangeRate(currency || baseCurrency, baseCurrency, options.fxRates ?? {})
    }
    const positions = buildAccountPositions(state, month as 0, { unitPrices }).filter(
      (position) => position.accountId === accountId,
    )
    for (const position of positions) {
      const line = evolution.get(position.instrumentId) ?? {
        instrumentId: position.instrumentId,
        symbol: position.symbol,
        values: Array.from({ length: throughMonth + 1 }, () => 0),
        priced: true,
      }
      evolution.set(position.instrumentId, line)
      line.values[month] = position.value
      if (!position.priced) line.priced = false
    }
  }
  return [...evolution.values()]
}
