import type { APIRoute } from 'astro'

import { isPriceRange, priceRangesFor } from '../../../domain/investment/price-history'
import { requirePrincipal, withApiErrorHandling } from '../../../lib/server/api-auth'
import { createJsonResponse } from '../../../lib/server/json-response'
import { loadPriceHistory } from '../../../lib/server/price-history'
import { runHttp } from '../../../lib/server/runtime'
import type { InstrumentType } from '../../../scripts/types'

const json = createJsonResponse('private, max-age=60')
const TYPES: readonly InstrumentType[] = ['stock', 'etf', 'fund', 'crypto']

// GET /api/market/history?symbol=VWCE.DE&type=etf&currency=EUR&range=1d
// → { history: PriceHistory }: the symbol's closes over the range, for its chart.
export const GET: APIRoute = async ({ url, locals }) =>
  withApiErrorHandling('/api/market/history', async () => {
    requirePrincipal(locals)
    const symbol = url.searchParams.get('symbol')?.trim() ?? ''
    const quoteSymbol = url.searchParams.get('quoteSymbol')?.trim() || undefined
    const type = url.searchParams.get('type') as InstrumentType
    const currency = url.searchParams.get('currency')?.trim() || 'EUR'
    const range = url.searchParams.get('range')
    if (!symbol || symbol.length > 40 || !TYPES.includes(type) || !isPriceRange(range)) {
      return json({ error: 'Símbolo, tipo o periodo no válido' }, 400)
    }
    if (!priceRangesFor(type).includes(range)) {
      return json({ error: 'Un fondo tiene un precio al día: no hay gráfica de un día' }, 400)
    }
    try {
      const history = await runHttp(
        loadPriceHistory({ symbol, quoteSymbol, type, currency }, range),
      )
      return json({ history })
    } catch (error) {
      console.error('[market/history] History lookup failed', error)
      return json({ error: `No se pudo cargar la cotización de ${symbol}` }, 502)
    }
  })
