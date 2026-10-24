import { Effect } from 'effect'

import type { Instrument, Quote } from '../scripts/types'
import type { MarketSearchResult } from '../lib/server/market-search'
import { isDemoMode } from '../scripts/demo-mode'
import { requestApiJson } from '../lib/client/api-client'
import { ApiClientError } from '../lib/client/api-error'
import type { ClientHttp } from '../lib/client/http'

export type { MarketSearchResult }

export const fetchMarketQuotes = (
  instruments: Instrument[],
  fallbackQuotes: Record<string, Quote>,
): Effect.Effect<Record<string, Quote>, ApiClientError, ClientHttp> => {
  if (!instruments.length) return Effect.succeed({})
  if (isDemoMode()) return Effect.succeed(fallbackQuotes)

  return requestApiJson<{ quotes?: Record<string, Quote> }>('/api/market/quotes', {
    method: 'POST',
    body: { instruments, fallbackQuotes },
    fallbackMessage: 'No se pudieron cargar las cotizaciones',
  }).pipe(Effect.map((body) => body.quotes || {}))
}

export const searchMarketSymbols = (
  query: string,
  provider: string,
): Effect.Effect<MarketSearchResult[], ApiClientError, ClientHttp> => {
  if (isDemoMode()) return Effect.succeed([])

  const params = new URLSearchParams({ q: query, provider })
  return requestApiJson<{ results?: MarketSearchResult[] }>(
    `/api/market/search?${params.toString()}`,
    { fallbackMessage: 'No se pudieron buscar símbolos' },
  ).pipe(Effect.map((body) => body.results || []))
}
