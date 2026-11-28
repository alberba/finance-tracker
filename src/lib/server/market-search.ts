/**
 * Symbol search against Yahoo Finance (ADR-0006), with its results cached for a
 * minute and identical searches in flight shared.
 */

import { Data, Deferred, Effect, Exit } from 'effect'
import { yahooFinance, YahooFinanceHttpError } from './yahoo-finance'

export interface MarketSearchResult {
  symbol: string
  name: string
  exchange: string
  currency: string
  type: string
}

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
): Effect.Effect<MarketSearchResult[], MarketSearchError> {
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
      const exit = yield* Effect.exit(loadSearchResults(cacheKey, normalizedQuery))
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
): Effect.Effect<MarketSearchResult[], MarketSearchError> {
  return Effect.tryPromise({
    try: () => yahooFinance.search(query, { quotesCount: 10, newsCount: 0 }),
    catch: toSearchError,
  }).pipe(
    Effect.map(parseYahooResults),
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
    name: String(quote.longname || quote.shortname || symbol),
    exchange: String(quote.exchDisp || quote.exchange || ''),
    currency: String(quote.currency || '').toUpperCase(),
    type: String(quote.quoteType || quote.typeDisp || ''),
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}
