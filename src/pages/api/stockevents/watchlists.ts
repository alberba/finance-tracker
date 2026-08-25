import type { APIRoute } from 'astro'
import { listStockEventsWatchlists } from '../../../lib/server/stockevents'
import { errorResponse, json, readApiKey } from './_helpers'
import { withApiErrorHandling } from '../../../lib/server/api-auth'

export const GET: APIRoute = async ({ locals }) =>
  withApiErrorHandling(async () => {
    const apiKey = await readApiKey(locals)
    if (!apiKey) return json({ error: 'Falta la API key de Stock Events' }, 400)
    try {
      return json({ watchlists: await listStockEventsWatchlists(apiKey) })
    } catch (error) {
      return errorResponse(error)
    }
  })
