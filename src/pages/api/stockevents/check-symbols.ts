import type { APIRoute } from 'astro'
import {
  checkStockEventsSymbols,
  type SymbolCheckRequest,
} from '../../../lib/server/stockevents'
import { errorResponse, json, readApiKey } from './_helpers'
import { withApiErrorHandling } from '../../../lib/server/api-auth'

interface CheckSymbolsBody {
  checks?: unknown
}

export const POST: APIRoute = async ({ request, locals }) =>
  withApiErrorHandling('/api/stockevents/check-symbols', async () => {
    const apiKey = await readApiKey(locals)
    if (!apiKey) return json({ error: 'Falta la API key de Stock Events' }, 400)
    const body = (await request.json().catch(() => ({}))) as CheckSymbolsBody
    const checks = normalizeChecks(body.checks)
    if (!checks.length) return json({ results: [] })
    try {
      return json({ results: await checkStockEventsSymbols(apiKey, checks) })
    } catch (error) {
      return errorResponse(error)
    }
  })

function normalizeChecks(value: unknown): SymbolCheckRequest[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      const raw = (item || {}) as Record<string, unknown>
      return {
        symbol: String(raw.symbol || '').trim().toUpperCase(),
        watchlistId: String(raw.watchlistId || '').trim(),
      }
    })
    .filter((check) => check.symbol && check.watchlistId)
    .slice(0, 100)
}
