/**
 * `GET /api/bootstrap?year` (WP4) — pure read, never writes (fixes
 * Contradiction #8: unlike legacy `GET /api/state`, this never auto-seeds
 * on miss). Returns the full private dataset a client needs to initialize
 * its local cache, plus the current sync revision cursor so it can resume
 * incremental sync via `GET /api/changes?since=<revision>` afterwards.
 *
 * `year` (optional) narrows `transactions`/`budgetEntries`/`wealthSnapshots`
 * to that calendar year — the common case for the dashboard's initial
 * paint — while every other collection (accounts, categories, goals, etc.)
 * is small enough to always return in full.
 *
 * The assembly itself lives in `src/lib/server/bootstrap-payload.ts` so the
 * round-trip test harness can exercise it without HTTP.
 */

import type { APIRoute } from 'astro'
import { getDb } from '../../db/client'
import { buildBootstrapPayload } from '../../lib/server/bootstrap-payload'
import { runWithDb } from '../../db/database'
import { jsonResponse, requirePrincipal, withApiErrorHandling } from '../../lib/server/api-auth'

function parseYear(raw: string | null): number | undefined | 'invalid' {
  if (!raw) {
    return undefined
  }
  const year = Number(raw)
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    return 'invalid'
  }
  return year
}

export const GET: APIRoute = async ({ request, locals }) =>
  withApiErrorHandling('/api/bootstrap', async () => {
    const principal = requirePrincipal(locals)
    const url = new URL(request.url)
    const year = parseYear(url.searchParams.get('year'))
    if (year === 'invalid') {
      return jsonResponse({ error: "Parámetro 'year' inválido." }, 400)
    }

    const payload = await runWithDb(getDb(locals), buildBootstrapPayload(principal.userId, year))
    return jsonResponse(payload, 200)
  })
