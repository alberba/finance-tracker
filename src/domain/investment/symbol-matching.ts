import type { Instrument, InstrumentQuoteSource } from '../../scripts/types'

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

/**
 * The ids a "Vincular movimientos" request fixes at click time (#489). It is
 * computed once, from the state the user is looking at, so a late resolution
 * can never add a movement created afterwards.
 */
export function unlinkedMovementIdsForInstrument<
  T extends {
    id: string
    type: string
    symbol?: string
    category: string
    instrumentId?: string
  },
>(transactions: readonly T[], instrument: Instrument, assetName?: string): string[] {
  return transactions
    .filter((transaction) => isUnlinkedMovementForInstrument(transaction, instrument, assetName))
    .map((transaction) => transaction.id)
}

/** A symbol as stored and compared: trimmed and upper case. */
export function normalizeSymbol(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase()
}

export function yahooQuoteSymbol(
  instrument: InstrumentQuoteSource,
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

/**
 * The kind of instrument a Yahoo or Morningstar ticker most likely is: a fund
 * for an ISIN or a `0P…` id (one price a day), crypto for a pair like `BTC-EUR`,
 * an ETF otherwise (shares and ETFs quote alike).
 */
export function inferInstrumentType(ticker: string): Instrument['type'] {
  const symbol = normalizeSymbol(ticker)
  if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(symbol) || /^0P[0-9A-Z]{8}(\..+)?$/.test(symbol)) return 'fund'
  if (/^[A-Z0-9]{2,10}-(EUR|USD|USDT|GBP)$/.test(symbol)) return 'crypto'
  return 'etf'
}
