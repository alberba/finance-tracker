import type { APIRoute } from 'astro'
import { listStockEventsWatchlists } from '../../../lib/server/stockevents'
import { runHttp } from '../../../lib/server/http'
import { errorResponse, json, readApiKey } from './_helpers'
import { withApiErrorHandling } from '../../../lib/server/api-auth'

export const GET: APIRoute = async ({ locals }) =>
  withApiErrorHandling('/api/stockevents/watchlists', async () => {
    const apiKey = await readApiKey(locals)
    if (!apiKey) return json({ error: 'Falta la API key de Stock Events' }, 400)
    try {
      return json({ watchlists: await runHttp(listStockEventsWatchlists(apiKey)) })
    } catch (error) {
      return errorResponse(error)
    }
  })
