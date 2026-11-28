import { Effect } from 'effect'

import type { PriceHistory, PriceRange } from '../domain/investment/price-history'
import type { SymbolCandidate } from '../domain/investment/ticker-suggestion'
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

/** An instrument's previous December close and then each month close of `year`; none in demo mode. */
export const fetchInstrumentCloses = (
  instrument: Pick<Instrument, 'symbol' | 'quoteSymbol' | 'type' | 'currency'>,
  year: number,
): Effect.Effect<number[], ApiClientError, ClientHttp> => {
  if (isDemoMode()) return Effect.succeed([])

  const params = new URLSearchParams({
    symbol: instrument.symbol,
    type: instrument.type,
    currency: instrument.currency,
    year: String(year),
  })
  if (instrument.quoteSymbol) params.set('quoteSymbol', instrument.quoteSymbol)
  return requestApiJson<{ closes?: number[] }>(`/api/market/closes?${params.toString()}`, {
    fallbackMessage: 'No se pudo cargar el histórico',
  }).pipe(Effect.map((body) => body.closes || []))
}

/** A symbol's closes over `range`, for its quote chart; null in demo mode. */
export const fetchPriceHistory = (
  instrument: Pick<Instrument, 'symbol' | 'quoteSymbol' | 'type' | 'currency'>,
  range: PriceRange,
): Effect.Effect<PriceHistory | null, ApiClientError, ClientHttp> => {
  if (isDemoMode()) return Effect.succeed(null)

  const params = new URLSearchParams({
    symbol: instrument.symbol,
    type: instrument.type,
    currency: instrument.currency,
    range,
  })
  if (instrument.quoteSymbol) params.set('quoteSymbol', instrument.quoteSymbol)
  return requestApiJson<{ history?: PriceHistory }>(`/api/market/history?${params.toString()}`, {
    fallbackMessage: 'No se pudo cargar la cotización',
  }).pipe(Effect.map((body) => body.history ?? null))
}

/** Yahoo's search for `query`: each result's ticker and kind; none in demo mode. */
export const fetchSymbolCandidates = (
  query: string,
): Effect.Effect<SymbolCandidate[], ApiClientError, ClientHttp> => {
  if (isDemoMode() || !query.trim()) return Effect.succeed([])

  const params = new URLSearchParams({ q: query.trim() })
  return requestApiJson<{ results?: SymbolCandidate[] }>(
    `/api/market/search?${params.toString()}`,
    { fallbackMessage: 'No se pudieron buscar símbolos' },
  ).pipe(Effect.map((body) => body.results ?? []))
}
