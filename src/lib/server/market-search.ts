/**
 * Symbol search against Yahoo Finance with a Twelve Data fallback (ADR-0006).
 *
 * Returns `Effect<MarketSearchResult[], MarketSearchError, Http>`: the
 * fallback, the timeout and the request de-duplication are composed, and
 * HTTP enters through the `Http` service.
 */

import { Data, Deferred, Effect, Exit } from 'effect'
import { Http } from './http'
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

const SEARCH_TIMEOUT = '5 seconds'
const SEARCH_CACHE_MS = 60_000
const searchCache = new Map<string, { expiresAt: number; results: MarketSearchResult[] }>()
const inFlightSearches = new Map<
  string,
  Deferred.Deferred<Exit.Exit<MarketSearchResult[], MarketSearchError>>
>()

export class MarketSearchError extends Data.TaggedError('MarketSearchError')<{
  message: string
  /** 0 when the provider failed before answering. */
  status: number
}> {}

export function searchYahooSymbols(
  query: string,
  env: MarketSearchEnv = {},
): Effect.Effect<MarketSearchResult[], MarketSearchError, Http> {
  return Effect.gen(function* () {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return []
    const cacheKey = normalizedQuery.toUpperCase()
    const cached = searchCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return cached.results
    if (cached) searchCache.delete(cacheKey)

    const pending = inFlightSearches.get(cacheKey)
    if (pending) {
      const shared = yield* Deferred.await(pending)
      if (Exit.isSuccess(shared)) return shared.value
      return yield* Effect.failCause(shared.cause)
    }

    const deferred = yield* Deferred.make<Exit.Exit<MarketSearchResult[], MarketSearchError>>()
    inFlightSearches.set(cacheKey, deferred)

    return yield* Effect.gen(function* () {
      const exit = yield* Effect.exit(loadSearchResults(cacheKey, normalizedQuery, env))
      yield* Deferred.succeed(deferred, exit)
      if (Exit.isSuccess(exit)) return exit.value
      return yield* Effect.failCause(exit.cause)
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (inFlightSearches.get(cacheKey) === deferred) inFlightSearches.delete(cacheKey)
        }),
      ),
    )
  })
}

function loadSearchResults(
  cacheKey: string,
  query: string,
  env: MarketSearchEnv,
): Effect.Effect<MarketSearchResult[], MarketSearchError, Http> {
  const search = Effect.tryPromise({
    try: () => yahooFinance.search(query, { quotesCount: 10, newsCount: 0 }),
    catch: toSearchError,
  }).pipe(Effect.map(parseYahooResults))

  return search.pipe(
    Effect.catchIf(
      (error: MarketSearchError) => Boolean(error),
      (error) => {
        if (!env.TWELVE_DATA_API_KEY || !shouldUseSearchFallback(error)) {
          return Effect.fail(error)
        }
        return searchTwelveDataSymbols(query, env)
      },
    ),
    Effect.tap((results) => Effect.sync(() => cacheSearchResults(cacheKey, results))),
  )
}

function toSearchError(error: unknown): MarketSearchError {
  if (error instanceof YahooFinanceHttpError) {
    return new MarketSearchError({
      message: `Yahoo Finance respondió ${error.status}`,
      status: error.status,
    })
  }
  return new MarketSearchError({ message: 'No se pudo buscar en Yahoo Finance', status: 0 })
}

function parseYahooResults(raw: unknown): MarketSearchResult[] {
  const body = asRecord(raw)
  const quotes = Array.isArray(body.quotes) ? body.quotes : []
  return quotes
    .map(toSearchResult)
    .filter((result): result is MarketSearchResult => result !== null)
}

function searchTwelveDataSymbols(
  query: string,
  env: MarketSearchEnv,
): Effect.Effect<MarketSearchResult[], MarketSearchError, Http> {
  return Effect.gen(function* () {
    const params = new URLSearchParams({ symbol: query, outputsize: '10' })
    const body = yield* fetchJson(`https://api.twelvedata.com/symbol_search?${params.toString()}`, {
      Authorization: `apikey ${env.TWELVE_DATA_API_KEY}`,
    })
    const data = asRecord(body)
    const results = Array.isArray(data.data) ? data.data : []
    return results
      .map(toSearchResult)
      .filter((result): result is MarketSearchResult => result !== null)
  })
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

function shouldUseSearchFallback(error: MarketSearchError): boolean {
  return error.status === 0 || error.status === 429 || error.status >= 500
}

function fetchJson(
  url: string,
  headers: Record<string, string>,
): Effect.Effect<unknown, MarketSearchError, Http> {
  return Effect.gen(function* () {
    const http = yield* Http
    const response = yield* Effect.tryPromise({
      try: (signal) => http.request(url, { signal, headers }),
      catch: () =>
        new MarketSearchError({ message: 'No se pudo contactar con el buscador.', status: 0 }),
    }).pipe(
      Effect.timeout(SEARCH_TIMEOUT),
      Effect.catchTag('TimeoutError', () =>
        Effect.fail(new MarketSearchError({ message: 'El buscador agotó el tiempo.', status: 0 })),
      ),
    )
    if (!response.ok) {
      return yield* new MarketSearchError({
        message: `Buscador respondió ${response.status}`,
        status: response.status,
      })
    }
    return yield* Effect.promise(() =>
      response.json().catch(() => {
        throw new MarketSearchError({ message: 'Respuesta inválida del buscador.', status: 0 })
      }),
    )
  })
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}
