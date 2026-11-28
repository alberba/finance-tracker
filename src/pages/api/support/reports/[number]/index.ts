import type { APIRoute } from 'astro'

import { getDb } from '../../../../../db/client'
import { readSupportCase } from '../../../../../db/repositories/private-reports'
import {
  jsonResponse,
  requirePrincipal,
  withApiErrorHandling,
} from '../../../../../lib/server/api-auth'
import {
  ISSUE_NUMBER_PATTERN,
  parseNumericParam,
} from '../../../../../lib/server/issue-reports/route'
import { runServer } from '../../../../../lib/server/runtime'

export const GET: APIRoute = async ({ params, locals }) =>
  withApiErrorHandling('/api/support/reports/[number]', async () => {
    const principal = requirePrincipal(locals)
    const number = parseNumericParam(params.number, ISSUE_NUMBER_PATTERN)
    if (!principal.isAdmin || !number) return jsonResponse({ error: 'Caso no disponible.' }, 404)
    const report = await runServer(
      getDb(locals),
      readSupportCase(number, principal.userId, new Date().toISOString()),
    )
    return report
      ? jsonResponse({ report }, 200)
      : jsonResponse({ error: 'Caso no disponible.' }, 404)
  })
