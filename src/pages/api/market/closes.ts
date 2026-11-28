import type { APIRoute } from 'astro'
import { Effect } from 'effect'

import { requirePrincipal, withApiErrorHandling } from '../../../lib/server/api-auth'
import { loadInstrumentCloses } from '../../../lib/server/benchmark-history'
import { createJsonResponse } from '../../../lib/server/json-response'
import { isMarketYear, parseInstrumentQuery } from '../../../lib/server/market-params'

const json = createJsonResponse('private, max-age=3600')

// GET /api/market/closes?symbol=ETH&type=crypto&currency=EUR&year=2026 → { closes: number[] }:
// the instrument's previous December close, then each month close of the year.
export const GET: APIRoute = async ({ url, locals }) =>
  withApiErrorHandling('/api/market/closes', async () => {
    requirePrincipal(locals)
    const instrument = parseInstrumentQuery(url.searchParams)
    const year = Number(url.searchParams.get('year'))
    if (!instrument || !isMarketYear(year)) {
      return json({ error: 'Símbolo, tipo o año no válido' }, 400)
    }
    try {
      const closes = await Effect.runPromise(loadInstrumentCloses(instrument, year))
      return json({ closes })
    } catch (error) {
      console.error('[market/closes] History lookup failed', error)
      return json({ error: `No se pudo consultar ${instrument.symbol}` }, 502)
    }
  })
