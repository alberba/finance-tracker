import { Cause, Data, Deferred, Effect } from 'effect'
import type { Instrument, Quote, QuoteDataType, QuoteProvider } from '../../scripts/types'
import { yahooQuoteSymbol } from '../../domain/investment/symbol-matching'
import { Http } from './http'
import { yahooFinance, YahooFinanceHttpError } from './yahoo-finance'

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
const DEFAULT_PROVIDER: QuoteProvider = 'yahoo'
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000
const memoryCache = new Map<string, { expiresAt: number; quote: Quote }>()
const inFlightQuotes = new Map<string, Deferred.Deferred<Quote>>()
const rateLimitedQuotes = new Map<string, number>()

interface ProviderQuote {
  provider: string
  raw: unknown
}

/** A provider answered with a non-2xx status. */
export class MarketProviderError extends Data.TaggedError('MarketProviderError')<{
  message: string
  status: number
  retryAfterMs: number | null
}> {}

/** The provider failed before answering (parse, timeout, unknown source). */
export class MarketQuoteError extends Data.TaggedError('MarketQuoteError')<{
  message: string
}> {}

type MarketFailure = MarketProviderError | MarketQuoteError

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

export function loadMarketQuote(
  request: MarketQuoteRequest,
  env: MarketDataEnv,
): Effect.Effect<Quote, never, Http> {
  return Effect.gen(function* () {
    if (
      typeof request.instrument.quoteSymbol === 'string' &&
      request.instrument.quoteSymbol.trim()
    ) {
      request = {
        ...request,
        instrument: {
          ...request.instrument,
          symbol: request.instrument.quoteSymbol.trim().toUpperCase(),
        },
      }
    }
    const cacheKey = buildCacheKey(request.instrument)
    const cached = memoryCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return cached.quote

    const rateLimitUntil = rateLimitedQuotes.get(cacheKey)
    if (rateLimitUntil && rateLimitUntil > Date.now()) {
      return buildFallbackQuote(request.instrument, request.fallback)
    }
    if (rateLimitUntil) rateLimitedQuotes.delete(cacheKey)

    const pending = inFlightQuotes.get(cacheKey)
    if (pending) return yield* Deferred.await(pending)

    const deferred = yield* Deferred.make<Quote>()
    inFlightQuotes.set(cacheKey, deferred)

    return yield* Effect.gen(function* () {
      const result = yield* loadAndCacheQuote(cacheKey, request.instrument, env).pipe(
        Effect.map((quote) => ({ quote })),
        Effect.catchCause((cause) => {
          rememberRateLimit(cacheKey, Cause.squash(cause))
          return Effect.succeed({ quote: buildFallbackQuote(request.instrument, request.fallback) })
        }),
      )
      yield* Deferred.succeed(deferred, result.quote)
      return result.quote
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (inFlightQuotes.get(cacheKey) === deferred) inFlightQuotes.delete(cacheKey)
        }),
      ),
    )
  })
}

function loadAndCacheQuote(
  cacheKey: string,
  instrument: Instrument,
  env: MarketDataEnv,
): Effect.Effect<Quote, MarketFailure, Http> {
  return Effect.gen(function* () {
    const edgeCached = yield* readEdgeCache(cacheKey)
    if (edgeCached) {
      memoryCache.set(cacheKey, { expiresAt: cacheExpiry(env), quote: edgeCached })
      return edgeCached
    }

    const { provider, raw } = yield* fetchProviderQuote(instrument, env)
    const quote = normalizeProviderQuote(instrument, raw, env, provider)
    memoryCache.set(cacheKey, { expiresAt: cacheExpiry(env), quote })
    yield* writeEdgeCache(cacheKey, quote, readNumber(env.MARKET_QUOTE_CACHE_SECONDS, 120))
    return quote
  })
}

function fetchProviderQuote(
  instrument: Instrument,
  env: MarketDataEnv,
): Effect.Effect<ProviderQuote, MarketFailure, Http> {
  return Effect.gen(function* () {
    const provider = resolveProvider(instrument, env)
    const fromProvider = (name: string): Effect.Effect<ProviderQuote, MarketFailure, Http> =>
      fetchProviderQuoteFrom(name, instrument, env).pipe(
        Effect.map((raw) => ({ provider: name, raw })),
      )
    return yield* fromProvider(provider).pipe(
      Effect.catchIf(
        (error: MarketFailure) => Boolean(error),
        (error) => {
          const fallbackProvider = resolveFallbackProvider(provider, env)
          if (!fallbackProvider || !shouldUseProviderFallback(provider, error)) {
            return Effect.fail(error)
          }
          return fromProvider(fallbackProvider)
        },
      ),
    )
  })
}

function resolveProvider(instrument: Instrument, env: MarketDataEnv): string {
  return normalizeProvider(instrument.provider || env.MARKET_DATA_PROVIDER || DEFAULT_PROVIDER)
}

function normalizeProvider(value: string): string {
  const provider = value.trim().toLowerCase()
  if (!provider) return DEFAULT_PROVIDER
  // Unknown values pass through so the fetch fails loudly instead of
  // silently quoting from another source.
  return provider
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
  if (!(error instanceof MarketProviderError || error instanceof YahooFinanceHttpError)) return true
  return error.status === 429 || error.status >= 500
}

function fetchProviderQuoteFrom(
  provider: string,
  instrument: Instrument,
  env: MarketDataEnv,
): Effect.Effect<unknown, MarketFailure, Http> {
  if (provider === 'yahoo') {
    return Effect.tryPromise({
      try: () => yahooFinance.quote(yahooQuoteSymbol(instrument)),
      catch: (error) =>
        error instanceof YahooFinanceHttpError
          ? new MarketProviderError({
              message: `Yahoo Finance respondió ${error.status}`,
              status: error.status,
              retryAfterMs: error.retryAfterMs,
            })
          : new MarketQuoteError({ message: 'No se pudo consultar Yahoo Finance.' }),
    })
  }
  if (provider === 'coingecko') return fetchCoinGecko(instrument, env)
  if (provider === 'twelve-data') return fetchTwelveData(instrument, env)
  return Effect.fail(
    new MarketQuoteError({ message: `Proveedor de cotizaciones desconocido: ${provider}` }),
  )
}

function fetchTwelveData(
  instrument: Instrument,
  env: MarketDataEnv,
): Effect.Effect<unknown, MarketFailure, Http> {
  return Effect.gen(function* () {
    if (!env.TWELVE_DATA_API_KEY) {
      return yield* new MarketQuoteError({ message: 'TWELVE_DATA_API_KEY no configurada' })
    }
    const params = new URLSearchParams({
      symbol:
        instrument.type === 'crypto'
          ? `${instrument.symbol}/${instrument.currency || 'USD'}`
          : instrument.symbol,
    })
    if (instrument.market) params.set('exchange', instrument.market)
    return yield* fetchJsonWithTimeout(`https://api.twelvedata.com/quote?${params.toString()}`, {
      Authorization: `apikey ${env.TWELVE_DATA_API_KEY}`,
    })
  })
}

function fetchCoinGecko(
  instrument: Instrument,
  env: MarketDataEnv,
): Effect.Effect<unknown, MarketFailure, Http> {
  return Effect.gen(function* () {
    if (!env.COINGECKO_API_KEY) {
      return yield* new MarketQuoteError({ message: 'COINGECKO_API_KEY no configurada' })
    }
    const params = new URLSearchParams({
      vs_currencies: (instrument.currency || 'usd').toLowerCase(),
      include_24hr_change: 'true',
      include_last_updated_at: 'true',
    })
    const coinId = resolveCoinGeckoId(instrument)
    if (coinId) params.set('ids', coinId)
    else params.set('symbols', instrument.symbol.toLowerCase())
    const plan = String(env.COINGECKO_API_PLAN || 'demo').toLowerCase()
    const isPro = plan === 'pro'
    const headers = {
      [isPro ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key']: env.COINGECKO_API_KEY,
    }
    const baseUrl = isPro
      ? 'https://pro-api.coingecko.com/api/v3'
      : 'https://api.coingecko.com/api/v3'
    return yield* fetchJsonWithTimeout(`${baseUrl}/simple/price?${params.toString()}`, headers)
  })
}

function normalizeProviderQuote(
  instrument: Instrument,
  raw: unknown,
  env: MarketDataEnv,
  provider = resolveProvider(instrument, env),
): Quote {
  const response = asRecord(raw)
  const fetchedAt = new Date().toISOString()
  if (provider === 'yahoo') {
    return normalizeYahooQuote(instrument, response, env, fetchedAt)
  }
  const providerRow =
    provider === 'coingecko'
      ? Object.values(response).find((value) => typeof value === 'object' && value !== null)
      : response[instrument.symbol.toLowerCase()]
  const row = asRecord(providerRow || response)
  const currencyKey = (instrument.currency || 'usd').toLowerCase()
  const price = readNumber(
    row.price ?? row.close ?? row[currencyKey] ?? row[`${currencyKey}_price`],
    NaN,
  )
  if (!Number.isFinite(price) || price < 0)
    throw new Error('El proveedor no devolvió un precio válido')
  const previousClose = readOptionalNumber(row.previous_close ?? row.previousClose)
  const changePercent = readOptionalNumber(
    row.percent_change ??
      row.changePercent ??
      row[`${currencyKey}_24h_change`] ??
      row.usd_24h_change,
  )
  const timestamp = normalizeTimestamp(
    row.datetime ?? row.timestamp ?? toMs(row.last_updated_at) ?? fetchedAt,
  )
  const stale =
    Date.now() - Date.parse(timestamp) > readNumber(env.MARKET_QUOTE_STALE_MINUTES, 15) * 60_000
  return {
    instrumentId: instrument.id,
    price,
    currency: String(row.currency || instrument.currency || 'EUR')
      .toUpperCase()
      .slice(0, 3),
    timestamp,
    fetchedAt,
    dataType: 'unknown',
    source: provider,
    status: stale ? 'stale' : 'fresh',
    isStale: stale,
    previousClose,
    changePercent: changePercent ?? calculateChangePercent(price, previousClose),
  }
}

function normalizeYahooQuote(
  instrument: Instrument,
  raw: Record<string, unknown>,
  env: MarketDataEnv,
  fetchedAt: string,
): Quote {
  if (instrument.type === 'crypto' && raw.quoteType && raw.quoteType !== 'CRYPTOCURRENCY')
    throw new Error('Yahoo Finance devolvió otro tipo de activo para la criptomoneda')
  const rawPrice = raw.regularMarketPrice
  if (typeof rawPrice !== 'number' || !Number.isFinite(rawPrice) || rawPrice < 0)
    throw new Error('Yahoo Finance no devolvió un precio válido')
  const currency = String(raw.currency || instrument.currency || 'EUR')
  const isPence = currency === 'GBp' || currency === 'GBX'
  const unitScale = isPence ? 0.01 : 1
  const price = rawPrice * unitScale
  const rawPreviousClose = raw.regularMarketPreviousClose
  const previousClose =
    typeof rawPreviousClose === 'number' && Number.isFinite(rawPreviousClose)
      ? rawPreviousClose * unitScale
      : null
  // The SDK coerces regularMarketTime to Date. When the provider sends no
  // market time, timestamp falls back to the retrieval time (fetchedAt) so it
  // always parses — and the quote is marked delayed/stale, never "live".
  const delayed = readNumber(raw.exchangeDataDelayedBy, 0) > 0
  const marketTime = raw.regularMarketTime
  const providerTimestamp =
    marketTime instanceof Date && Number.isFinite(marketTime.getTime())
      ? marketTime.toISOString()
      : null
  const dataType: QuoteDataType = delayed ? 'delayed' : 'unknown'
  const timestamp = providerTimestamp ?? fetchedAt
  const stale =
    !providerTimestamp ||
    delayed ||
    Date.now() - Date.parse(timestamp) > readNumber(env.MARKET_QUOTE_STALE_MINUTES, 15) * 60_000
  return {
    instrumentId: instrument.id,
    price,
    currency: isPence ? 'GBP' : currency.toUpperCase().slice(0, 3),
    timestamp,
    fetchedAt,
    dataType,
    source: 'yahoo',
    status: stale ? 'stale' : 'fresh',
    isStale: stale,
    previousClose,
    changePercent:
      readOptionalNumber(raw.regularMarketChangePercent) ??
      calculateChangePercent(price, previousClose),
  }
}

function resolveCoinGeckoId(instrument: Instrument): string {
  const configuredId = instrument.market.trim().toLowerCase()
  if (configuredId) return configuredId
  const knownIds: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    XRP: 'ripple',
    ADA: 'cardano',
    DOGE: 'dogecoin',
    DOT: 'polkadot',
    AVAX: 'avalanche-2',
    LINK: 'chainlink',
    USDT: 'tether',
    USDC: 'usd-coin',
    BNB: 'binancecoin',
    LTC: 'litecoin',
  }
  return knownIds[instrument.symbol.toUpperCase()] || ''
}

function buildFallbackQuote(instrument: Instrument, fallback?: Quote | null): Quote {
  if (fallback) {
    return { ...fallback, instrumentId: instrument.id, status: 'stale', isStale: true }
  }
  const fetchedAt = new Date().toISOString()
  return {
    instrumentId: instrument.id,
    price: 0,
    currency: instrument.currency || 'EUR',
    timestamp: fetchedAt,
    fetchedAt,
    dataType: 'unknown',
    source: 'unavailable',
    status: 'unavailable',
    isStale: true,
    previousClose: null,
    changePercent: null,
  }
}

function fetchJsonWithTimeout(
  url: string,
  headers?: Record<string, string>,
): Effect.Effect<unknown, MarketFailure, Http> {
  return Effect.gen(function* () {
    const http = yield* Http
    const response = yield* Effect.tryPromise({
      try: (signal) => http.request(url, { signal, headers }),
      catch: () => new MarketQuoteError({ message: 'No se pudo contactar con el proveedor.' }),
    }).pipe(
      Effect.timeout(`${DEFAULT_TIMEOUT_MS} millis`),
      Effect.catchTag('TimeoutError', () =>
        Effect.fail(
          new MarketQuoteError({ message: 'El proveedor agotó el tiempo de respuesta.' }),
        ),
      ),
    )
    if (!response.ok) {
      return yield* new MarketProviderError({
        message: `Proveedor de mercado respondió ${response.status}`,
        status: response.status,
        retryAfterMs: readRetryAfterMs(response),
      })
    }
    return yield* Effect.promise(() =>
      response.json().catch(() => {
        throw new MarketQuoteError({ message: 'Respuesta inválida del proveedor.' })
      }),
    )
  })
}

function cacheExpiry(env: MarketDataEnv): number {
  return Date.now() + readNumber(env.MARKET_QUOTE_CACHE_SECONDS, 120) * 1_000
}

function rememberRateLimit(cacheKey: string, error: unknown): void {
  if (
    !(error instanceof MarketProviderError || error instanceof YahooFinanceHttpError) ||
    error.status !== 429
  )
    return
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
  return [
    instrument.id,
    instrument.provider,
    instrument.type,
    normalizeProvider(instrument.provider) === 'yahoo'
      ? yahooQuoteSymbol(instrument)
      : instrument.symbol,
    instrument.market,
    instrument.currency,
  ].join(':')
}

function readEdgeCache(cacheKey: string): Effect.Effect<Quote | null> {
  const cache = getEdgeCache()
  if (!cache) return Effect.succeed(null)
  return Effect.tryPromise({
    try: async () => {
      const response = await cache.match(cacheRequest(cacheKey))
      if (!response) return null
      const value = (await response.json()) as Quote
      return value?.instrumentId ? value : null
    },
    catch: () => null,
  }).pipe(Effect.catchCause(() => Effect.succeed(null)))
}

function writeEdgeCache(
  cacheKey: string,
  quote: Quote,
  maxAgeSeconds: number,
): Effect.Effect<void> {
  const cache = getEdgeCache()
  if (!cache) return Effect.void
  return Effect.tryPromise({
    try: async () => {
      await cache.put(
        cacheRequest(cacheKey),
        new Response(JSON.stringify(quote), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `max-age=${maxAgeSeconds}`,
          },
        }),
      )
    },
    catch: () => undefined,
  }).pipe(Effect.ignore)
}

function getEdgeCache(): EdgeCache | null {
  const cachesValue = (globalThis as typeof globalThis & { caches?: { default?: EdgeCache } })
    .caches
  return cachesValue?.default || null
}

function cacheRequest(cacheKey: string): Request {
  return new Request(`https://finance-tracker.invalid/market/${encodeURIComponent(cacheKey)}`)
}

function normalizeTimestamp(value: unknown): string {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString()
}

/** CoinGecko `last_updated_at` arrives as unix seconds; Date.parse needs ms. */
function toMs(value: unknown): string | null {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  const ms = seconds < 1e12 ? seconds * 1_000 : seconds
  return new Date(ms).toISOString()
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
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}
