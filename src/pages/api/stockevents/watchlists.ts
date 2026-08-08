import type { APIRoute } from 'astro'
import { listStockEventsWatchlists } from '../../../lib/server/stockevents'
import { errorResponse, json, readApiKey } from './_helpers'

export const GET: APIRoute = async ({ request, locals }) => {
  const apiKey = await readApiKey(request, locals)
  if (!apiKey) {
    return json({ error: 'Falta la API key de Stock Events' }, 400)
  }
  try {
    const watchlists = await listStockEventsWatchlists(apiKey)
    return json({ watchlists })
  } catch (error) {
    return errorResponse(error)
  }
}
