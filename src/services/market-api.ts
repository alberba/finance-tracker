import { Effect } from 'effect'

import type { Instrument, Quote } from '../scripts/types'
import { isDemoMode } from '../scripts/demo-mode'
import { requestApiJson } from '../lib/client/api-client'
import { ApiClientError } from '../lib/client/api-error'
import type { ClientHttp } from '../lib/client/http'

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

/** An index's previous December close and then each month close of `year`. */
export const fetchBenchmarkCloses = (
  id: string,
  year: number,
): Effect.Effect<number[], ApiClientError, ClientHttp> => {
  if (isDemoMode()) return Effect.succeed([])

  const params = new URLSearchParams({ id, year: String(year) })
  return requestApiJson<{ closes?: number[] }>(`/api/market/benchmark?${params.toString()}`, {
    fallbackMessage: 'No se pudo cargar el índice',
  }).pipe(Effect.map((body) => body.closes || []))
}
