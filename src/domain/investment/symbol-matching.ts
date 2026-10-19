import type { Instrument } from '../../scripts/types'

export function symbolsMatchInstrument(
  transactionSymbol: unknown,
  instrument: Instrument,
): boolean {
  const normalizedTransactionSymbol = normalizeSymbol(transactionSymbol)
  const normalizedInstrumentSymbol = normalizeSymbol(instrument.symbol)
  if (normalizedTransactionSymbol === normalizedInstrumentSymbol) return true
  const normalizedQuoteSymbol = normalizeSymbol(instrument.quoteSymbol || instrument.symbol)
  if (normalizedTransactionSymbol === normalizedQuoteSymbol) return true
  if (instrument.provider.toLowerCase() !== 'yahoo') return false
  if (instrument.type === 'crypto') {
    return (
      stripCryptoQuoteCurrency(normalizedTransactionSymbol) ===
        stripCryptoQuoteCurrency(normalizedInstrumentSymbol) ||
      stripCryptoQuoteCurrency(normalizedTransactionSymbol) ===
        stripCryptoQuoteCurrency(normalizedQuoteSymbol)
    )
  }
  return (
    stripYahooMarketSuffix(normalizedTransactionSymbol) ===
      stripYahooMarketSuffix(normalizedInstrumentSymbol) ||
    stripYahooMarketSuffix(normalizedTransactionSymbol) ===
      stripYahooMarketSuffix(normalizedQuoteSymbol)
  )
}

/** A movement the instrument would take when its existing movements are linked. */
export function isUnlinkedMovementForInstrument(
  transaction: { type: string; symbol?: string; category: string; instrumentId?: string },
  instrument: Instrument,
  assetName?: string,
): boolean {
  if (transaction.type !== 'investment' || transaction.instrumentId) return false
  if (symbolsMatchInstrument(transaction.symbol, instrument)) return true
  return !transaction.symbol && Boolean(assetName && transaction.category === assetName)
}

/** A symbol as stored and compared: trimmed and upper case. */
export function normalizeSymbol(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase()
}

export function yahooQuoteSymbol(
  instrument: Pick<Instrument, 'symbol' | 'quoteSymbol' | 'type' | 'currency'>,
): string {
  const symbol = normalizeSymbol(instrument.quoteSymbol || instrument.symbol)
  if (instrument.type !== 'crypto') return symbol
  if (symbol.includes('-')) return symbol
  if (symbol.includes('/')) return symbol.replace('/', '-')
  // Yahoo's bare BTC ticker is a listed security, not the cryptocurrency.
  return `${symbol}-${normalizeSymbol(instrument.currency) || 'EUR'}`
}

/** A visible label is not part of a quote's identity when its ticker is explicit. */
export function quoteSourceKey(
  instrument: Pick<
    Instrument,
    'symbol' | 'quoteSymbol' | 'type' | 'provider' | 'currency' | 'market'
  >,
): string {
  const ticker =
    instrument.provider === 'yahoo'
      ? yahooQuoteSymbol(instrument)
      : normalizeSymbol(instrument.quoteSymbol || instrument.symbol)
  return JSON.stringify([
    instrument.provider,
    instrument.type,
    ticker,
    instrument.currency,
    instrument.market,
  ])
}

function stripYahooMarketSuffix(symbol: string): string {
  return symbol.replace(/\.[A-Z]{2,5}$/, '')
}

function stripCryptoQuoteCurrency(symbol: string): string {
  return symbol.replace(/[-/][A-Z]{3}$/, '')
}
