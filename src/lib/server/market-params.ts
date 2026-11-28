import { isInstrumentType, type InstrumentQuoteSource } from '../../scripts/types'

/** The longest symbol the market lookups accept. */
const MAX_SYMBOL_LENGTH = 40

/**
 * The instrument a market request names (`symbol`, `quoteSymbol`, `type`,
 * `currency`); null when the symbol or the type is not valid.
 */
export function parseInstrumentQuery(params: URLSearchParams): InstrumentQuoteSource | null {
  const symbol = params.get('symbol')?.trim() ?? ''
  const type = params.get('type')
  if (!symbol || symbol.length > MAX_SYMBOL_LENGTH || !isInstrumentType(type)) return null
  return {
    symbol,
    quoteSymbol: params.get('quoteSymbol')?.trim() || undefined,
    type,
    currency: params.get('currency')?.trim() || 'EUR',
  }
}

/** A year the monthly closes can be asked for. */
export function isMarketYear(year: number): boolean {
  return Number.isInteger(year) && year >= 1990 && year <= 2100
}
