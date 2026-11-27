import type { APIRoute } from 'astro'
import { Effect } from 'effect'

import { findBenchmark } from '../../../domain/investment/benchmarks'
import { requirePrincipal, withApiErrorHandling } from '../../../lib/server/api-auth'
import { loadBenchmarkCloses } from '../../../lib/server/benchmark-history'
import { createJsonResponse } from '../../../lib/server/json-response'

const json = createJsonResponse('private, max-age=3600')

// GET /api/market/benchmark?id=msci-world&year=2026 → { closes: number[] }:
// the index's previous December close, then each month close of the year.
export const GET: APIRoute = async ({ url, locals }) =>
  withApiErrorHandling('/api/market/benchmark', async () => {
    requirePrincipal(locals)
    const benchmark = findBenchmark(url.searchParams.get('id') ?? '')
    const year = Number(url.searchParams.get('year'))
    if (!benchmark || !Number.isInteger(year) || year < 1990 || year > 2100) {
      return json({ error: 'Índice o año no válido' }, 400)
    }
    try {
      return json({ closes: await Effect.runPromise(loadBenchmarkCloses(benchmark, year)) })
    } catch (error) {
      console.error('[market/benchmark] History lookup failed', error)
      return json({ error: `No se pudo consultar ${benchmark.name}` }, 502)
    }
  })
