import type { Instrument } from '../../scripts/types'

export function symbolsMatchInstrument(
  transactionSymbol: unknown,
  instrument: Instrument,
): boolean {
  const normalizedTransactionSymbol = normalizeSymbol(transactionSymbol)
  const normalizedInstrumentSymbol = normalizeSymbol(instrument.symbol)
  if (normalizedTransactionSymbol === normalizedInstrumentSymbol) return true
  if (instrument.provider.toLowerCase() !== 'yahoo') return false
  return (
    stripYahooMarketSuffix(normalizedTransactionSymbol) ===
    stripYahooMarketSuffix(normalizedInstrumentSymbol)
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

function normalizeSymbol(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase()
}

function stripYahooMarketSuffix(symbol: string): string {
  return symbol.replace(/\.[A-Z]{2,5}$/, '')
}
