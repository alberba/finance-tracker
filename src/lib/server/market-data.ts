import type { Instrument, Quote } from '../../scripts/types'

export interface MarketDataEnv {
  MARKET_DATA_PROVIDER?: string
  TWELVE_DATA_API_KEY?: string
  COINGECKO_API_KEY?: string
  COINGECKO_API_PLAN?: string
  MARKET_QUOTE_STALE_MINUTES?: string
  MARKET_QUOTE_CACHE_SECONDS?: string
}

export interface MarketQuoteRequest {
  instrument: Instrument
  fallback?: Quote | null
}

const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_PROVIDER = 'twelve-data'
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000
const memoryCache = new Map<string, { expiresAt: number; quote: Quote }>()
const inFlightQuotes = new Map<string, Promise<Quote>>()
const rateLimitedQuotes = new Map<string, number>()

interface ProviderQuote {
  provider: string
  raw: unknown
}

class MarketProviderError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | null,
  ) {
    super(`Proveedor de mercado respondió ${status}`)
    this.name = 'MarketProviderError'
  }
}

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

export async function loadMarketQuote(
  request: MarketQuoteRequest,
  env: MarketDataEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Quote> {
  const cacheKey = buildCacheKey(request.instrument)
  const cached = memoryCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.quote

  const rateLimitUntil = rateLimitedQuotes.get(cacheKey)
  if (rateLimitUntil && rateLimitUntil > Date.now()) {
    return buildFallbackQuote(request.instrument, request.fallback)
  }
  if (rateLimitUntil) rateLimitedQuotes.delete(cacheKey)

  const pending = inFlightQuotes.get(cacheKey) || createQuoteLoad(cacheKey, request.instrument, env, fetchImpl)
  try {
    return await pending
  } catch (error) {
    rememberRateLimit(cacheKey, error)
    return buildFallbackQuote(request.instrument, request.fallback)
  } finally {
    if (inFlightQuotes.get(cacheKey) === pending) inFlightQuotes.delete(cacheKey)
  }
}

function createQuoteLoad(
  cacheKey: string,
  instrument: Instrument,
  env: MarketDataEnv,
  fetchImpl: typeof fetch,
): Promise<Quote> {
  const pending = loadAndCacheQuote(cacheKey, instrument, env, fetchImpl)
  inFlightQuotes.set(cacheKey, pending)
  return pending
}

async function loadAndCacheQuote(
  cacheKey: string,
  instrument: Instrument,
  env: MarketDataEnv,
  fetchImpl: typeof fetch,
): Promise<Quote> {
  const edgeCached = await readEdgeCache(cacheKey)
  if (edgeCached) {
    memoryCache.set(cacheKey, { expiresAt: cacheExpiry(env), quote: edgeCached })
    return edgeCached
  }

  const providerQuote = await fetchProviderQuote(instrument, env, fetchImpl)
  const quote = normalizeProviderQuote(instrument, providerQuote.raw, env, providerQuote.provider)
  memoryCache.set(cacheKey, { expiresAt: cacheExpiry(env), quote })
  await writeEdgeCache(cacheKey, quote, readNumber(env.MARKET_QUOTE_CACHE_SECONDS, 120))
  return quote
}

async function fetchProviderQuote(
  instrument: Instrument,
  env: MarketDataEnv,
  fetchImpl: typeof fetch,
): Promise<ProviderQuote> {
  const provider = resolveProvider(instrument, env)
  try {
    return {
      provider,
      raw: await fetchProviderQuoteFrom(provider, instrument, env, fetchImpl),
    }
  } catch (error) {
    const fallbackProvider = resolveFallbackProvider(provider, env)
    if (!fallbackProvider || !shouldUseProviderFallback(provider, error)) throw error
    return {
      provider: fallbackProvider,
      raw: await fetchProviderQuoteFrom(fallbackProvider, instrument, env, fetchImpl),
    }
  }
}

function resolveProvider(instrument: Instrument, env: MarketDataEnv): string {
  return normalizeProvider(instrument.provider || env.MARKET_DATA_PROVIDER || DEFAULT_PROVIDER)
}

function normalizeProvider(value: string): string {
  const provider = value.trim().toLowerCase()
  return provider === 'yahoo' || provider === 'coingecko' ? provider : DEFAULT_PROVIDER
}

function resolveFallbackProvider(provider: string, env: MarketDataEnv): string | null {
  const configuredProvider = normalizeProvider(env.MARKET_DATA_PROVIDER || DEFAULT_PROVIDER)
  if (configuredProvider === provider) return null
  if (configuredProvider === 'twelve-data' && !env.TWELVE_DATA_API_KEY) return null
  if (configuredProvider === 'coingecko' && !env.COINGECKO_API_KEY) return null
  return configuredProvider
}

function shouldUseProviderFallback(provider: string, error: unknown): boolean {
  if (provider !== 'yahoo') return false
  if (!(error instanceof MarketProviderError)) return true
  return error.status === 429 || error.status >= 500
}

async function fetchProviderQuoteFrom(
  provider: string,
  instrument: Instrument,
  env: MarketDataEnv,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  if (provider === 'yahoo') return fetchYahooFinance(instrument, fetchImpl)
  if (provider === 'coingecko') return fetchCoinGecko(instrument, env, fetchImpl)
  return fetchTwelveData(instrument, env, fetchImpl)
}

async function fetchTwelveData(
  instrument: Instrument,
  env: MarketDataEnv,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  if (!env.TWELVE_DATA_API_KEY) throw new Error('TWELVE_DATA_API_KEY no configurada')
  const params = new URLSearchParams({
    symbol: instrument.type === 'crypto' ? `${instrument.symbol}/${instrument.currency || 'USD'}` : instrument.symbol,
  })
  if (instrument.market) params.set('exchange', instrument.market)
  return fetchJsonWithTimeout(
    `https://api.twelvedata.com/quote?${params.toString()}`,
    fetchImpl,
    { Authorization: `apikey ${env.TWELVE_DATA_API_KEY}` },
  )
}

async function fetchYahooFinance(
  instrument: Instrument,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const params = new URLSearchParams({
    range: '5d',
    interval: '1d',
    events: 'div,splits',
  })
  const symbol = encodeURIComponent(instrument.symbol)
  return fetchJsonWithTimeout(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?${params.toString()}`,
    fetchImpl,
    { Accept: 'application/json' },
  )
}

async function fetchCoinGecko(
  instrument: Instrument,
  env: MarketDataEnv,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  if (!env.COINGECKO_API_KEY) throw new Error('COINGECKO_API_KEY no configurada')
  const params = new URLSearchParams({
    vs_currencies: (instrument.currency || 'usd').toLowerCase(),
    include_24hr_change: 'true',
  })
  const coinId = resolveCoinGeckoId(instrument)
  if (coinId) params.set('ids', coinId)
  else params.set('symbols', instrument.symbol.toLowerCase())
  const plan = String(env.COINGECKO_API_PLAN || 'demo').toLowerCase()
  const isPro = plan === 'pro'
  const headers = {
    [isPro ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key']: env.COINGECKO_API_KEY,
  }
  const baseUrl = isPro ? 'https://pro-api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3'
  return fetchJsonWithTimeout(
    `${baseUrl}/simple/price?${params.toString()}`,
    fetchImpl,
    headers,
  )
}

function normalizeProviderQuote(
  instrument: Instrument,
  raw: unknown,
  env: MarketDataEnv,
  provider = resolveProvider(instrument, env),
): Quote {
  const response = asRecord(raw)
  if (provider === 'yahoo') {
    return normalizeYahooQuote(instrument, response, env)
  }
  const providerRow = provider === 'coingecko'
    ? Object.values(response).find((value) => typeof value === 'object' && value !== null)
    : response[instrument.symbol.toLowerCase()]
  const row = asRecord(providerRow || response)
  const currencyKey = (instrument.currency || 'usd').toLowerCase()
  const price = readNumber(row.price ?? row.close ?? row[currencyKey] ?? row[`${currencyKey}_price`], NaN)
  if (!Number.isFinite(price) || price < 0) throw new Error('El proveedor no devolvió un precio válido')
  const previousClose = readOptionalNumber(row.previous_close ?? row.previousClose)
  const changePercent = readOptionalNumber(row.percent_change ?? row.changePercent ?? row[`${currencyKey}_24h_change`] ?? row.usd_24h_change)
  const timestamp = normalizeTimestamp(row.datetime ?? row.timestamp ?? new Date().toISOString())
  const stale = Date.now() - Date.parse(timestamp) > readNumber(env.MARKET_QUOTE_STALE_MINUTES, 15) * 60_000
  return {
    instrumentId: instrument.id,
    price,
    currency: String(row.currency || instrument.currency || 'EUR').toUpperCase().slice(0, 3),
    timestamp,
    source: provider,
    status: stale ? 'stale' : 'fresh',
    isStale: stale,
    previousClose,
    changePercent: changePercent ?? calculateChangePercent(price, previousClose),
  }
}

function normalizeYahooQuote(instrument: Instrument, raw: Record<string, unknown>, env: MarketDataEnv): Quote {
  const chart = asRecord(raw.chart)
  const result = Array.isArray(chart.result) ? asRecord(chart.result[0]) : {}
  const meta = asRecord(result.meta)
  const latestClose = readLatestYahooClose(result)
  const price = readNumber(meta.regularMarketPrice, latestClose?.price ?? NaN)
  if (!Number.isFinite(price) || price < 0) throw new Error('Yahoo Finance no devolvió un precio válido')
  const previousClose = readOptionalNumber(meta.chartPreviousClose ?? meta.previousClose)
  const timestamp = normalizeYahooTimestamp(meta, latestClose?.timestamp)
  const stale = Date.now() - Date.parse(timestamp) > readNumber(env.MARKET_QUOTE_STALE_MINUTES, 15) * 60_000
  return {
    instrumentId: instrument.id,
    price,
    currency: String(meta.currency || instrument.currency || 'EUR').toUpperCase().slice(0, 3),
    timestamp,
    source: 'yahoo',
    status: stale ? 'stale' : 'fresh',
    isStale: stale,
    previousClose,
    changePercent: readOptionalNumber(meta.regularMarketChangePercent) ?? calculateChangePercent(price, previousClose),
  }
}

function readLatestYahooClose(result: Record<string, unknown>): { price: number; timestamp: number | null } | null {
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : []
  const indicators = asRecord(result.indicators)
  const quote = Array.isArray(indicators.quote) ? asRecord(indicators.quote[0]) : {}
  const closes = Array.isArray(quote.close) ? quote.close : []
  for (let index = closes.length - 1; index >= 0; index -= 1) {
    const price = readNumber(closes[index], NaN)
    if (Number.isFinite(price)) {
      return { price, timestamp: readOptionalNumber(timestamps[index]) }
    }
  }
  return null
}

function normalizeYahooTimestamp(meta: Record<string, unknown>, fallbackTimestamp: number | null | undefined): string {
  const marketTime = readOptionalNumber(meta.regularMarketTime)
  const timestamp = marketTime ?? fallbackTimestamp
  return timestamp ? new Date(timestamp * 1_000).toISOString() : new Date().toISOString()
}

function resolveCoinGeckoId(instrument: Instrument): string {
  const configuredId = instrument.market.trim().toLowerCase()
  if (configuredId) return configuredId
  const knownIds: Record<string, string> = {
    BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', ADA: 'cardano',
    DOGE: 'dogecoin', DOT: 'polkadot', AVAX: 'avalanche-2', LINK: 'chainlink',
    USDT: 'tether', USDC: 'usd-coin', BNB: 'binancecoin', LTC: 'litecoin',
  }
  return knownIds[instrument.symbol.toUpperCase()] || ''
}

function buildFallbackQuote(instrument: Instrument, fallback?: Quote | null): Quote {
  if (fallback) {
    return { ...fallback, instrumentId: instrument.id, status: 'stale', isStale: true }
  }
  return {
    instrumentId: instrument.id,
    price: 0,
    currency: instrument.currency || 'EUR',
    timestamp: '',
    source: 'unavailable',
    status: 'unavailable',
    isStale: true,
    previousClose: null,
    changePercent: null,
  }
}

async function fetchJsonWithTimeout(
  url: string,
  fetchImpl: typeof fetch,
  headers?: Record<string, string>,
): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers })
    if (!response.ok) throw new MarketProviderError(response.status, readRetryAfterMs(response))
    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function cacheExpiry(env: MarketDataEnv): number {
  return Date.now() + readNumber(env.MARKET_QUOTE_CACHE_SECONDS, 120) * 1_000
}

function rememberRateLimit(cacheKey: string, error: unknown): void {
  if (!(error instanceof MarketProviderError) || error.status !== 429) return
  const retryAfterMs = error.retryAfterMs || 0
  const cooldownMs = Math.max(DEFAULT_RATE_LIMIT_COOLDOWN_MS, retryAfterMs)
  rateLimitedQuotes.set(cacheKey, Date.now() + cooldownMs)
}

function readRetryAfterMs(response: Response): number | null {
  const retryAfter = response.headers.get('Retry-After')
  if (!retryAfter) return null
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000)
  const date = Date.parse(retryAfter)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null
}

function buildCacheKey(instrument: Instrument): string {
  return [instrument.id, instrument.provider, instrument.type, instrument.symbol, instrument.market, instrument.currency].join(':')
}

async function readEdgeCache(cacheKey: string): Promise<Quote | null> {
  const cache = getEdgeCache()
  if (!cache) return null
  try {
    const response = await cache.match(cacheRequest(cacheKey))
    if (!response) return null
    const value = await response.json() as Quote
    return value?.instrumentId ? value : null
  } catch {
    return null
  }
}

async function writeEdgeCache(cacheKey: string, quote: Quote, maxAgeSeconds: number): Promise<void> {
  const cache = getEdgeCache()
  if (!cache) return
  try {
    await cache.put(cacheRequest(cacheKey), new Response(JSON.stringify(quote), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${maxAgeSeconds}` },
    }))
  } catch {
    return
  }
}

function getEdgeCache(): EdgeCache | null {
  const cachesValue = (globalThis as typeof globalThis & { caches?: { default?: EdgeCache } }).caches
  return cachesValue?.default || null
}

function cacheRequest(cacheKey: string): Request {
  return new Request(`https://finance-tracker.invalid/market/${encodeURIComponent(cacheKey)}`)
}

function normalizeTimestamp(value: unknown): string {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString()
}

function calculateChangePercent(price: number, previousClose: number | null): number | null {
  if (!previousClose) return null
  return Math.round(((price - previousClose) / previousClose) * 100_00) / 100
}

function readNumber(value: unknown, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function readOptionalNumber(value: unknown): number | null {
  const number = readNumber(value, NaN)
  return Number.isFinite(number) ? number : null
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}
