import type { APIRoute } from 'astro'

import { getDb } from '../../../../db/client'
import { withdraw } from '../../../../db/repositories/private-reports'
import {
  jsonResponse,
  requirePrincipal,
  withApiErrorHandling,
} from '../../../../lib/server/api-auth'
import { ISSUE_NUMBER_PATTERN, parseNumericParam } from '../../../../lib/server/issue-reports/route'
import { runServer } from '../../../../lib/server/runtime'

export const DELETE: APIRoute = async ({ params, locals }) =>
  withApiErrorHandling('/api/reports/[number]/diagnostic', async () => {
    const principal = requirePrincipal(locals)
    const number = parseNumericParam(params.number, ISSUE_NUMBER_PATTERN)
    const removed =
      number &&
      (await runServer(getDb(locals), withdraw(principal.userId, number, new Date().toISOString())))
    return removed
      ? new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
      : jsonResponse({ error: 'Reporte no disponible.' }, 404)
  })
