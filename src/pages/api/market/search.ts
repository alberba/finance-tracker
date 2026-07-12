import type { APIRoute } from 'astro'
import { searchYahooSymbols } from '../../../lib/server/market-search'

export const GET: APIRoute = async ({ url }) => {
  const query = url.searchParams.get('q')?.trim() || ''
  const provider = url.searchParams.get('provider')?.trim().toLowerCase() || 'yahoo'
  if (provider !== 'yahoo') return json({ error: 'La búsqueda solo está disponible para Yahoo Finance' }, 400)
  if (!query) return json({ results: [] })

  try {
    return json({ results: await searchYahooSymbols(query) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudieron buscar símbolos'
    return json({ error: message }, 502)
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=60' },
  })
}
