/**
 * Stock Events API client (ADR-0006).
 *
 * Every operation returns `Effect<A, StockEventsApiError, Http>`: the caller
 * decides when to execute it, HTTP enters through the `Http` service and the
 * failures are typed. Timeouts are composed instead of hand-rolled.
 */

import { Data, Effect } from 'effect'
import { Http } from './http'

const STOCK_EVENTS_BASE_URL = 'https://stockevents.app/api/v1'
const DEFAULT_TIMEOUT = '8 seconds'

export interface StockEventsWatchlist {
  id: string
  name: string
  currency?: string
}

export interface StockEventsTransactionPayload {
  watchlistId: string
  symbol: string
  date: string
  change: number
  price: number
  priceCurrency: string
  feesAmount?: number
  feesCurrency?: string
  notes?: string
  toCash?: boolean
  type: string
}

export interface StockEventsCreatedTransaction {
  id: string
  watchlistId: string
  symbol: string
}

export type SymbolCheckStatus = 'in-watchlist' | 'detected' | 'not-detected' | 'error'

export interface SymbolCheckRequest {
  symbol: string
  watchlistId: string
}

export interface SymbolCheckResult {
  symbol: string
  watchlistId: string
  status: SymbolCheckStatus
  message?: string
}

export class StockEventsApiError extends Data.TaggedError('StockEventsApiError')<{
  message: string
  status: number
}> {}

interface StockEventsResponseBody {
  data?: unknown
  error?: { code?: string; message?: string }
}

function stockEventsFetch(
  apiKey: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Effect.Effect<unknown, StockEventsApiError, Http> {
  return Effect.gen(function* () {
    const http = yield* Http
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        http.request(`${STOCK_EVENTS_BASE_URL}${path}`, {
          method: init.method || 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
          signal,
        }),
      catch: () =>
        new StockEventsApiError({ message: 'No se pudo conectar con Stock Events', status: 502 }),
    }).pipe(
      Effect.timeout(DEFAULT_TIMEOUT),
      Effect.catchTag('TimeoutError', () =>
        Effect.fail(
          new StockEventsApiError({ message: 'Stock Events no respondió a tiempo', status: 504 }),
        ),
      ),
    )
    if (response.status === 204) {
      return null
    }
    const body = yield* Effect.promise(
      () => response.json().catch(() => null) as Promise<StockEventsResponseBody | null>,
    )
    if (!response.ok) {
      return yield* new StockEventsApiError({
        message: describeApiError(response.status, body?.error),
        status: response.status,
      })
    }
    return body?.data ?? null
  })
}

function describeApiError(
  status: number,
  error: { code?: string; message?: string } | undefined,
): string {
  if (status === 401) return 'API key inválida o revocada'
  if (status === 403) return 'La cuenta de Stock Events no tiene acceso Pro activo'
  return error?.message || `Stock Events respondió con estado ${status}`
}

export function listStockEventsWatchlists(
  apiKey: string,
): Effect.Effect<StockEventsWatchlist[], StockEventsApiError, Http> {
  return stockEventsFetch(apiKey, '/watchlists').pipe(
    Effect.map((data) => {
      if (!Array.isArray(data)) return []
      return data
        .map((item) => {
          const raw = (item || {}) as Record<string, unknown>
          return {
            id: String(raw.id || ''),
            name: String(raw.name || ''),
            ...(raw.currency ? { currency: String(raw.currency) } : {}),
          }
        })
        .filter((watchlist) => Boolean(watchlist.id))
    }),
  )
}

export function listWatchlistSymbols(
  apiKey: string,
  watchlistId: string,
): Effect.Effect<string[], StockEventsApiError, Http> {
  return stockEventsFetch(apiKey, `/watchlists/${encodeURIComponent(watchlistId)}/symbols`).pipe(
    Effect.map((data) => {
      if (!Array.isArray(data)) return []
      return data
        .map((entry) => {
          const raw = (entry || {}) as Record<string, unknown>
          return raw.isDeleted === true
            ? ''
            : String(raw.symbol || '')
                .trim()
                .toUpperCase()
        })
        .filter(Boolean)
    }),
  )
}

export function addSymbolToWatchlist(
  apiKey: string,
  watchlistId: string,
  symbol: string,
): Effect.Effect<void, StockEventsApiError, Http> {
  return stockEventsFetch(apiKey, `/watchlists/${encodeURIComponent(watchlistId)}/symbols`, {
    method: 'POST',
    body: { symbol },
  }).pipe(Effect.asVoid)
}

function removeSymbolFromWatchlist(
  apiKey: string,
  watchlistId: string,
  symbol: string,
): Effect.Effect<void, StockEventsApiError, Http> {
  return stockEventsFetch(
    apiKey,
    `/watchlists/${encodeURIComponent(watchlistId)}/symbols/${encodeURIComponent(symbol)}`,
    { method: 'DELETE' },
  ).pipe(Effect.asVoid)
}

/**
 * Verifies each symbol against Stock Events without leaving side effects:
 * symbols already present in the target watchlist are reported as such; the
 * rest are validated with an add + immediate delete dry run, so a rejected
 * add means Stock Events does not recognise the ticker.
 */
export function checkStockEventsSymbols(
  apiKey: string,
  checks: SymbolCheckRequest[],
): Effect.Effect<SymbolCheckResult[], StockEventsApiError, Http> {
  return Effect.gen(function* () {
    const symbolsByWatchlist = new Map<string, Set<string>>()

    function watchlistSymbols(
      watchlistId: string,
    ): Effect.Effect<Set<string>, StockEventsApiError, Http> {
      const cached = symbolsByWatchlist.get(watchlistId)
      if (cached) return Effect.succeed(cached)
      return listWatchlistSymbols(apiKey, watchlistId).pipe(
        Effect.map((symbols) => {
          const set = new Set(symbols)
          symbolsByWatchlist.set(watchlistId, set)
          return set
        }),
      )
    }

    const results: SymbolCheckResult[] = []
    for (const check of checks) {
      const symbol = check.symbol.trim().toUpperCase()
      const watchlistId = check.watchlistId.trim()
      if (!symbol || !watchlistId) {
        results.push({ symbol, watchlistId, status: 'error', message: 'Falta símbolo o lista' })
        continue
      }
      const result = yield* Effect.gen(function* () {
        const existing = yield* watchlistSymbols(watchlistId)
        if (existing.has(symbol)) {
          return { symbol, watchlistId, status: 'in-watchlist' } satisfies SymbolCheckResult
        }
        yield* addSymbolToWatchlist(apiKey, watchlistId, symbol)
        yield* removeSymbolFromWatchlist(apiKey, watchlistId, symbol).pipe(Effect.ignore)
        return { symbol, watchlistId, status: 'detected' } satisfies SymbolCheckResult
      }).pipe(
        Effect.catchIf(
          (error) => error.status !== 401 && error.status !== 403,
          (error) =>
            Effect.succeed({
              symbol,
              watchlistId,
              status: error.status >= 400 && error.status < 500 ? 'not-detected' : 'error',
              message: error.message,
            } satisfies SymbolCheckResult),
        ),
      )
      results.push(result)
    }
    return results
  })
}

/**
 * Ensures the symbol belongs to the target watchlist and then registers the
 * transaction. Stock Events keeps holdings per watchlist symbol, so the add
 * step is required for symbols that were never synced before.
 */
export function createStockEventsTransaction(
  apiKey: string,
  payload: StockEventsTransactionPayload,
): Effect.Effect<StockEventsCreatedTransaction, StockEventsApiError, Http> {
  return Effect.gen(function* () {
    const symbol = payload.symbol.trim().toUpperCase()
    if (!symbol.startsWith('CASH_')) {
      const existing = yield* listWatchlistSymbols(apiKey, payload.watchlistId)
      if (!existing.includes(symbol)) {
        yield* addSymbolToWatchlist(apiKey, payload.watchlistId, symbol)
      }
    }
    const data = yield* stockEventsFetch(apiKey, '/transactions', {
      method: 'POST',
      body: { ...payload, symbol },
    })
    const raw = (data || {}) as Record<string, unknown>
    return {
      id: String(raw.id || ''),
      watchlistId: String(raw.watchlistId || payload.watchlistId),
      symbol: String(raw.symbol || symbol),
    }
  })
}
