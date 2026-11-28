import type { APIRoute } from 'astro'

import { isPriceRange, priceRangesFor } from '../../../domain/investment/price-history'
import { requirePrincipal, withApiErrorHandling } from '../../../lib/server/api-auth'
import { createJsonResponse } from '../../../lib/server/json-response'
import { parseInstrumentQuery } from '../../../lib/server/market-params'
import { loadPriceHistory } from '../../../lib/server/price-history'
import { runHttp } from '../../../lib/server/runtime'

const json = createJsonResponse('private, max-age=60')

// GET /api/market/history?symbol=VWCE.DE&type=etf&currency=EUR&range=1d
// → { history: PriceHistory }: the symbol's closes over the range, for its chart.
export const GET: APIRoute = async ({ url, locals }) =>
  withApiErrorHandling('/api/market/history', async () => {
    requirePrincipal(locals)
    const instrument = parseInstrumentQuery(url.searchParams)
    const range = url.searchParams.get('range')
    if (!instrument || !isPriceRange(range)) {
      return json({ error: 'Símbolo, tipo o periodo no válido' }, 400)
    }
    if (!priceRangesFor(instrument.type).includes(range)) {
      return json({ error: 'Un fondo tiene un precio al día: no hay gráfica de un día' }, 400)
    }
    try {
      const history = await runHttp(loadPriceHistory(instrument, range))
      return json({ history })
    } catch (error) {
      console.error('[market/history] History lookup failed', error)
      return json({ error: `No se pudo cargar la cotización de ${instrument.symbol}` }, 502)
    }
  })
