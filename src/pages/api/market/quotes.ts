import type { APIRoute } from 'astro'
import { getRuntimeEnvFromLocals } from '../../../lib/server/cloudflare-env'
import { loadMarketQuote, type MarketDataEnv } from '../../../lib/server/market-data'
import { createJsonResponse } from '../../../lib/server/json-response'
import { runServer } from '../../../lib/server/runtime'
import { getDb } from '../../../db/client'
import type { Instrument, Quote } from '../../../scripts/types'
import { requirePrincipal, withApiErrorHandling } from '../../../lib/server/api-auth'

const json = createJsonResponse('private, max-age=30')

interface QuotesBody {
  instruments?: unknown
  fallbackQuotes?: unknown
}

export const POST: APIRoute = async ({ request, locals }) =>
  withApiErrorHandling('/api/market/quotes', async () => {
    requirePrincipal(locals)
    try {
      const body = (await request.json()) as QuotesBody
      const instruments = normalizeInstruments(body.instruments)
      if (!instruments.length) {
        return json({ quotes: {} })
      }

      const fallbackQuotes = normalizeFallbackQuotes(body.fallbackQuotes)
      const env = getRuntimeEnvFromLocals(locals) as MarketDataEnv
      const entries = await Promise.all(
        instruments.map(
          async (instrument) =>
            [
              instrument.id,
              await runServer(
                getDb(locals),
                loadMarketQuote({ instrument, fallback: fallbackQuotes[instrument.id] }, env),
              ),
            ] as const,
        ),
      )
      return json({ quotes: Object.fromEntries(entries) })
    } catch (error) {
      console.error('[market/quotes] Quote lookup failed', error)
      return json({ error: 'No se pudieron consultar las cotizaciones' }, 502)
    }
  })

function normalizeInstruments(value: unknown): Instrument[] {
  return Array.isArray(value) ? value.filter(isInstrument).slice(0, 50) : []
}

function isInstrument(value: unknown): value is Instrument {
  if (!value || typeof value !== 'object') return false
  const instrument = value as Partial<Instrument>
  return Boolean(instrument.id && instrument.symbol && instrument.investmentAssetId)
}

function normalizeFallbackQuotes(value: unknown): Record<string, Quote> {
  return value && typeof value === 'object' ? (value as Record<string, Quote>) : {}
}
