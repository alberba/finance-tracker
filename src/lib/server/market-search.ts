import { yahooFinance, YahooFinanceHttpError } from './yahoo-finance'

export interface MarketSearchResult {
  symbol: string
  name: string
  exchange: string
  currency: string
  type: string
}

export interface MarketSearchEnv {
  TWELVE_DATA_API_KEY?: string
}

const SEARCH_TIMEOUT_MS = 5_000
const SEARCH_CACHE_MS = 60_000
const searchCache = new Map<string, { expiresAt: number; results: MarketSearchResult[] }>()
const inFlightSearches = new Map<string, Promise<MarketSearchResult[]>>()

class MarketSearchError extends Error {
  constructor(readonly status: number) {
    super(`Yahoo Finance respondió ${status}`)
    this.name = 'MarketSearchError'
  }
}

export async function searchYahooSymbols(
  query: string,
  fetchImpl: typeof fetch = fetch,
  env: MarketSearchEnv = {},
): Promise<MarketSearchResult[]> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return []
  const cacheKey = normalizedQuery.toUpperCase()
  const cached = searchCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.results
  if (cached) searchCache.delete(cacheKey)

  const pending =
    inFlightSearches.get(cacheKey) || createSearch(cacheKey, normalizedQuery, fetchImpl, env)
  try {
    return await pending
  } finally {
    if (inFlightSearches.get(cacheKey) === pending) inFlightSearches.delete(cacheKey)
  }
}

function createSearch(
  cacheKey: string,
  query: string,
  fetchImpl: typeof fetch,
  env: MarketSearchEnv,
): Promise<MarketSearchResult[]> {
  const pending = loadSearchResults(cacheKey, query, fetchImpl, env)
  inFlightSearches.set(cacheKey, pending)
  return pending
}

async function loadSearchResults(
  cacheKey: string,
  query: string,
  fetchImpl: typeof fetch,
  env: MarketSearchEnv,
): Promise<MarketSearchResult[]> {
  try {
    const body = await yahooFinance.search(query, { quotesCount: 10, newsCount: 0 })
    const results = parseYahooResults(body)
    cacheSearchResults(cacheKey, results)
    return results
  } catch (error) {
    if (!env.TWELVE_DATA_API_KEY || !shouldUseSearchFallback(error)) throw error
    const results = await searchTwelveDataSymbols(query, env, fetchImpl)
    cacheSearchResults(cacheKey, results)
    return results
  }
}

function parseYahooResults(raw: unknown): MarketSearchResult[] {
  const body = asRecord(raw)
  const quotes = Array.isArray(body.quotes) ? body.quotes : []
  return quotes
    .map(toSearchResult)
    .filter((result): result is MarketSearchResult => result !== null)
}

async function searchTwelveDataSymbols(
  query: string,
  env: MarketSearchEnv,
  fetchImpl: typeof fetch,
): Promise<MarketSearchResult[]> {
  const params = new URLSearchParams({ symbol: query, outputsize: '10' })
  const body = await fetchJson(
    `https://api.twelvedata.com/symbol_search?${params.toString()}`,
    fetchImpl,
    { Authorization: `apikey ${env.TWELVE_DATA_API_KEY}` },
  )
  const data = asRecord(body)
  const results = Array.isArray(data.data) ? data.data : []
  return results
    .map(toSearchResult)
    .filter((result): result is MarketSearchResult => result !== null)
}

function cacheSearchResults(cacheKey: string, results: MarketSearchResult[]): void {
  searchCache.set(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_MS, results })
}

function toSearchResult(value: unknown): MarketSearchResult | null {
  if (!value || typeof value !== 'object') return null
  const quote = value as Record<string, unknown>
  const symbol = String(quote.symbol || '')
    .trim()
    .toUpperCase()
  if (!symbol) return null
  return {
    symbol,
    name: String(quote.longname || quote.shortname || quote.instrument_name || symbol),
    exchange: String(quote.exchDisp || quote.exchange || ''),
    currency: String(quote.currency || '').toUpperCase(),
    type: String(quote.quoteType || quote.typeDisp || quote.instrument_type || ''),
  }
}

function shouldUseSearchFallback(error: unknown): boolean {
  if (!(error instanceof MarketSearchError || error instanceof YahooFinanceHttpError)) return true
  return error.status === 429 || error.status >= 500
}

async function fetchJson(
  url: string,
  fetchImpl: typeof fetch,
  headers: Record<string, string>,
): Promise<unknown> {
  const response = await fetchWithTimeout(url, fetchImpl, headers)
  if (!response.ok) throw new MarketSearchError(response.status)
  return response.json()
}

async function fetchWithTimeout(
  url: string,
  fetchImpl: typeof fetch,
  headers: Record<string, string>,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)
  try {
    return await fetchImpl(url, { signal: controller.signal, headers })
  } finally {
    clearTimeout(timeout)
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}
