import type { Instrument, Quote } from '../scripts/types'
import type { MarketSearchResult } from '../lib/server/market-search'
import { isDemoMode } from '../scripts/demo-mode'

export type { MarketSearchResult }

export async function fetchMarketQuotes(
  instruments: Instrument[],
  fallbackQuotes: Record<string, Quote>,
): Promise<Record<string, Quote>> {
  if (!instruments.length) return {}
  if (isDemoMode()) return fallbackQuotes

  const response = await fetch('/api/market/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ instruments, fallbackQuotes }),
  })
  const body = (await response.json()) as { quotes?: Record<string, Quote>; error?: string }
  if (!response.ok) throw new Error(body.error || 'No se pudieron cargar las cotizaciones')
  return body.quotes || {}
}

export async function searchMarketSymbols(query: string, provider: string): Promise<MarketSearchResult[]> {
  if (isDemoMode()) return []

  const params = new URLSearchParams({ q: query, provider })
  const response = await fetch(`/api/market/search?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  })
  const body = await response.json() as { results?: MarketSearchResult[]; error?: string }
  if (!response.ok) throw new Error(body.error || 'No se pudieron buscar símbolos')
  return body.results || []
}
