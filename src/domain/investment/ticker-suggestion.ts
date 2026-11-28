import { normalizeSymbol } from './symbol-matching'

/** One result of the symbol search (`/api/market/search`). */
export interface SymbolCandidate {
  symbol: string
  type: string
}

// Exchanges in the order a portfolio in euros is best quoted from: Xetra,
// Milan, Amsterdam, Paris, Madrid and the other euro markets, then the US (no
// suffix) and London, which quotes many ETFs in pence or dollars. Any other
// suffix (regional German exchanges, Toronto…) comes after all of them.
const SUFFIX_ORDER = ['DE', 'MI', 'AS', 'PA', 'MC', 'BR', 'LS', 'VI', 'HE', 'IR', '', 'L']

/**
 * The Yahoo ticker to propose for an asset whose movements carry `symbol`
 * (XDWH → XDWH.DE, BTC → BTC-EUR, AMZN → AMZN), from the search results; null
 * when no result is that same symbol on some exchange.
 */
export function suggestYahooTicker(
  symbol: string,
  candidates: readonly SymbolCandidate[],
  currency = 'EUR',
): string | null {
  const base = normalizeSymbol(symbol)
  if (!base) return null
  const crypto = candidates.find(
    (candidate) =>
      candidate.type.toUpperCase() === 'CRYPTOCURRENCY' &&
      normalizeSymbol(candidate.symbol).split('-')[0] === base,
  )
  if (crypto) return `${base}-${normalizeSymbol(currency) || 'EUR'}`

  const ranked = candidates
    .map((candidate) => normalizeSymbol(candidate.symbol))
    .filter((ticker) => ticker.split('.')[0] === base && !/[=^]/.test(ticker))
    .map((ticker) => {
      const suffix = ticker.includes('.') ? ticker.slice(ticker.indexOf('.') + 1) : ''
      const rank = SUFFIX_ORDER.indexOf(suffix)
      return { ticker, rank: rank === -1 ? SUFFIX_ORDER.length : rank }
    })
    .sort((a, b) => a.rank - b.rank)
  return ranked[0]?.ticker ?? null
}
