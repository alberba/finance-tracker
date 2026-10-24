import type { APIRoute } from 'astro'
import { listStockEventsWatchlists } from '../../../lib/server/stockevents'
import { runServer } from '../../../lib/server/runtime'
import { getDb } from '../../../db/client'
import { errorResponse, json, readApiKey } from './_helpers'
import { withApiErrorHandling } from '../../../lib/server/api-auth'

export const GET: APIRoute = async ({ locals }) =>
  withApiErrorHandling('/api/stockevents/watchlists', async () => {
    const apiKey = await readApiKey(locals)
    if (!apiKey) return json({ error: 'Falta la API key de Stock Events' }, 400)
    try {
      return json({ watchlists: await runServer(getDb(locals), listStockEventsWatchlists(apiKey)) })
    } catch (error) {
      return errorResponse(error)
    }
  })
