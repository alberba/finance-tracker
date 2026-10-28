import type { APIRoute } from 'astro'

import { getDb } from '../../../db/client'
import { jsonResponse } from '../../../lib/server/api-auth'
import { getRuntimeEnvFromLocals } from '../../../lib/server/cloudflare-env'
import { runReportsRoute } from '../../../lib/server/issue-reports/route'
import { listReports } from '../../../lib/server/issue-reports/service'
import { runServer } from '../../../lib/server/runtime'

/** `GET /api/reports` — los reportes de la cuenta autenticada, leídos de GitHub. */
export const GET: APIRoute = ({ locals }) =>
  runReportsRoute('/api/reports', locals, async (principal) => {
    const result = await runServer(
      getDb(locals),
      listReports(principal.userId, getRuntimeEnvFromLocals(locals)),
    )
    return jsonResponse({ ok: true, ...result }, 200)
  })
