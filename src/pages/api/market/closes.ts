import type { APIRoute } from 'astro'
import { Effect } from 'effect'

import { requirePrincipal, withApiErrorHandling } from '../../../lib/server/api-auth'
import { loadInstrumentCloses } from '../../../lib/server/benchmark-history'
import { createJsonResponse } from '../../../lib/server/json-response'
import type { InstrumentType } from '../../../scripts/types'

const json = createJsonResponse('private, max-age=3600')
const TYPES: readonly InstrumentType[] = ['stock', 'etf', 'fund', 'crypto']

// GET /api/market/closes?symbol=ETH&type=crypto&currency=EUR&year=2026 → { closes: number[] }:
// the instrument's previous December close, then each month close of the year.
export const GET: APIRoute = async ({ url, locals }) =>
  withApiErrorHandling('/api/market/closes', async () => {
    requirePrincipal(locals)
    const symbol = url.searchParams.get('symbol')?.trim() ?? ''
    const quoteSymbol = url.searchParams.get('quoteSymbol')?.trim() || undefined
    const type = url.searchParams.get('type') as InstrumentType
    const currency = url.searchParams.get('currency')?.trim() || 'EUR'
    const year = Number(url.searchParams.get('year'))
    if (
      !symbol ||
      symbol.length > 40 ||
      !TYPES.includes(type) ||
      !Number.isInteger(year) ||
      year < 1990 ||
      year > 2100
    ) {
      return json({ error: 'Símbolo, tipo o año no válido' }, 400)
    }
    try {
      const closes = await Effect.runPromise(
        loadInstrumentCloses({ symbol, quoteSymbol, type, currency }, year),
      )
      return json({ closes })
    } catch (error) {
      console.error('[market/closes] History lookup failed', error)
      return json({ error: `No se pudo consultar ${symbol}` }, 502)
    }
  })
