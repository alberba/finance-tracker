const STOCK_EVENTS_BASE_URL = 'https://stockevents.app/api/v1'
const DEFAULT_TIMEOUT_MS = 8_000

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

export class StockEventsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'StockEventsApiError'
  }
}

async function stockEventsFetch(
  apiKey: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetchImpl(`${STOCK_EVENTS_BASE_URL}${path}`, {
      method: init.method || 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: controller.signal,
    })
    if (response.status === 204) {
      return null
    }
    const body = (await response.json().catch(() => null)) as
      | { data?: unknown; error?: { code?: string; message?: string } }
      | null
    if (!response.ok) {
      throw new StockEventsApiError(describeApiError(response.status, body?.error), response.status)
    }
    return body?.data ?? null
  } catch (error) {
    if (error instanceof StockEventsApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new StockEventsApiError('Stock Events no respondió a tiempo', 504)
    }
    throw new StockEventsApiError('No se pudo conectar con Stock Events', 502)
  } finally {
    clearTimeout(timeout)
  }
}

function describeApiError(
  status: number,
  error: { code?: string; message?: string } | undefined,
): string {
  if (status === 401) return 'API key inválida o revocada'
  if (status === 403) return 'La cuenta de Stock Events no tiene acceso Pro activo'
  return error?.message || `Stock Events respondió con estado ${status}`
}

export async function listStockEventsWatchlists(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StockEventsWatchlist[]> {
  const data = await stockEventsFetch(apiKey, '/watchlists', {}, fetchImpl)
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
}

export async function listWatchlistSymbols(
  apiKey: string,
  watchlistId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const data = await stockEventsFetch(
    apiKey,
    `/watchlists/${encodeURIComponent(watchlistId)}/symbols`,
    {},
    fetchImpl,
  )
  if (!Array.isArray(data)) return []
  return data
    .map((entry) => {
      const raw = (entry || {}) as Record<string, unknown>
      return raw.isDeleted === true ? '' : String(raw.symbol || '').trim().toUpperCase()
    })
    .filter(Boolean)
}

export async function addSymbolToWatchlist(
  apiKey: string,
  watchlistId: string,
  symbol: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await stockEventsFetch(
    apiKey,
    `/watchlists/${encodeURIComponent(watchlistId)}/symbols`,
    { method: 'POST', body: { symbol } },
    fetchImpl,
  )
}

async function removeSymbolFromWatchlist(
  apiKey: string,
  watchlistId: string,
  symbol: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await stockEventsFetch(
    apiKey,
    `/watchlists/${encodeURIComponent(watchlistId)}/symbols/${encodeURIComponent(symbol)}`,
    { method: 'DELETE' },
    fetchImpl,
  )
}

/**
 * Verifies each symbol against Stock Events without leaving side effects:
 * symbols already present in the target watchlist are reported as such; the
 * rest are validated with an add + immediate delete dry run, so a rejected
 * add means Stock Events does not recognise the ticker.
 */
export async function checkStockEventsSymbols(
  apiKey: string,
  checks: SymbolCheckRequest[],
  fetchImpl: typeof fetch = fetch,
): Promise<SymbolCheckResult[]> {
  const symbolsByWatchlist = new Map<string, Set<string>>()

  async function watchlistSymbols(watchlistId: string): Promise<Set<string>> {
    const cached = symbolsByWatchlist.get(watchlistId)
    if (cached) return cached
    const symbols = new Set(await listWatchlistSymbols(apiKey, watchlistId, fetchImpl))
    symbolsByWatchlist.set(watchlistId, symbols)
    return symbols
  }

  const results: SymbolCheckResult[] = []
  for (const check of checks) {
    const symbol = check.symbol.trim().toUpperCase()
    const watchlistId = check.watchlistId.trim()
    if (!symbol || !watchlistId) {
      results.push({ symbol, watchlistId, status: 'error', message: 'Falta símbolo o lista' })
      continue
    }
    try {
      const existing = await watchlistSymbols(watchlistId)
      if (existing.has(symbol)) {
        results.push({ symbol, watchlistId, status: 'in-watchlist' })
        continue
      }
      await addSymbolToWatchlist(apiKey, watchlistId, symbol, fetchImpl)
      await removeSymbolFromWatchlist(apiKey, watchlistId, symbol, fetchImpl).catch(() => undefined)
      results.push({ symbol, watchlistId, status: 'detected' })
    } catch (error) {
      const status = error instanceof StockEventsApiError ? error.status : 0
      const message = error instanceof Error ? error.message : 'Error desconocido'
      if (status === 401 || status === 403) {
        throw error
      }
      results.push({
        symbol,
        watchlistId,
        status: status >= 400 && status < 500 ? 'not-detected' : 'error',
        message,
      })
    }
  }
  return results
}

/**
 * Ensures the symbol belongs to the target watchlist and then registers the
 * transaction. Stock Events keeps holdings per watchlist symbol, so the add
 * step is required for symbols that were never synced before.
 */
export async function createStockEventsTransaction(
  apiKey: string,
  payload: StockEventsTransactionPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<StockEventsCreatedTransaction> {
  const symbol = payload.symbol.trim().toUpperCase()
  const existing = await listWatchlistSymbols(apiKey, payload.watchlistId, fetchImpl)
  if (!existing.includes(symbol)) {
    await addSymbolToWatchlist(apiKey, payload.watchlistId, symbol, fetchImpl)
  }
  const data = await stockEventsFetch(
    apiKey,
    '/transactions',
    { method: 'POST', body: { ...payload, symbol } },
    fetchImpl,
  )
  const raw = (data || {}) as Record<string, unknown>
  return {
    id: String(raw.id || ''),
    watchlistId: String(raw.watchlistId || payload.watchlistId),
    symbol: String(raw.symbol || symbol),
  }
}
