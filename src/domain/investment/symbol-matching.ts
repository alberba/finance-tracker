import type { Instrument } from '../../scripts/types'

export function symbolsMatchInstrument(transactionSymbol: unknown, instrument: Instrument): boolean {
  const normalizedTransactionSymbol = normalizeSymbol(transactionSymbol)
  const normalizedInstrumentSymbol = normalizeSymbol(instrument.symbol)
  if (normalizedTransactionSymbol === normalizedInstrumentSymbol) return true
  if (instrument.provider.toLowerCase() !== 'yahoo') return false
  return stripYahooMarketSuffix(normalizedTransactionSymbol) === stripYahooMarketSuffix(normalizedInstrumentSymbol)
}

function normalizeSymbol(value: unknown): string {
  return String(value || '').trim().toUpperCase()
}

function stripYahooMarketSuffix(symbol: string): string {
  return symbol.replace(/\.[A-Z]{2,5}$/, '')
}
