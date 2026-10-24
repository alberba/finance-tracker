import type { APIRoute } from 'astro'
import { searchYahooSymbols } from '../../../lib/server/market-search'
import { createJsonResponse } from '../../../lib/server/json-response'
import { runHttp } from '../../../lib/server/http'
import { requirePrincipal, withApiErrorHandling } from '../../../lib/server/api-auth'
import { getRuntimeEnvFromLocals } from '../../../lib/server/cloudflare-env'

const json = createJsonResponse('private, max-age=60')

export const GET: APIRoute = async ({ url, locals }) =>
  withApiErrorHandling('/api/market/search', async () => {
    requirePrincipal(locals)
    const query = url.searchParams.get('q')?.trim() || ''
    const provider = url.searchParams.get('provider')?.trim().toLowerCase() || 'yahoo'
    if (provider !== 'yahoo')
      return json({ error: 'La búsqueda solo está disponible para Yahoo Finance' }, 400)
    if (!query) return json({ results: [] })

    try {
      return json({
        results: await runHttp(searchYahooSymbols(query, getRuntimeEnvFromLocals(locals))),
      })
    } catch (error) {
      console.error('[market/search] Symbol search failed', error)
      return json({ error: 'No se pudieron buscar símbolos' }, 502)
    }
  })
