export interface MarketSearchResult {
  symbol: string
  name: string
  exchange: string
  currency: string
  type: string
}

const SEARCH_TIMEOUT_MS = 5_000

export async function searchYahooSymbols(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketSearchResult[]> {
  const params = new URLSearchParams({ q: query, quotesCount: '10', newsCount: '0' })
  const response = await fetchWithTimeout(
    `https://query1.finance.yahoo.com/v1/finance/search?${params.toString()}`,
    fetchImpl,
  )
  if (!response.ok) throw new Error(`Yahoo Finance respondió ${response.status}`)
  const body = await response.json() as Record<string, unknown>
  const quotes = Array.isArray(body.quotes) ? body.quotes : []
  return quotes
    .map(toSearchResult)
    .filter((result): result is MarketSearchResult => result !== null)
}

function toSearchResult(value: unknown): MarketSearchResult | null {
  if (!value || typeof value !== 'object') return null
  const quote = value as Record<string, unknown>
  const symbol = String(quote.symbol || '').trim().toUpperCase()
  if (!symbol) return null
  return {
    symbol,
    name: String(quote.longname || quote.shortname || symbol),
    exchange: String(quote.exchDisp || quote.exchange || ''),
    currency: String(quote.currency || '').toUpperCase(),
    type: String(quote.quoteType || quote.typeDisp || ''),
  }
}

async function fetchWithTimeout(url: string, fetchImpl: typeof fetch): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)
  try {
    return await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
  } finally {
    clearTimeout(timeout)
  }
}
