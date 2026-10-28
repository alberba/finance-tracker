import type { APIRoute } from 'astro'

import { getDb } from '../../../../db/client'
import { jsonResponse } from '../../../../lib/server/api-auth'
import { getRuntimeEnvFromLocals } from '../../../../lib/server/cloudflare-env'
import {
  invalidParam,
  ISSUE_NUMBER_PATTERN,
  parseNumericParam,
  runReportsRoute,
} from '../../../../lib/server/issue-reports/route'
import { getReportDetail } from '../../../../lib/server/issue-reports/service'
import { runServer } from '../../../../lib/server/runtime'

/** `GET /api/reports/:number` — estado e hilo del reporte propio. */
export const GET: APIRoute = ({ locals, params }) =>
  runReportsRoute('/api/reports/[number]', locals, async (principal) => {
    const issueNumber = parseNumericParam(params.number, ISSUE_NUMBER_PATTERN)
    if (issueNumber === null) throw invalidParam('number')
    const detail = await runServer(
      getDb(locals),
      getReportDetail(principal.userId, issueNumber, getRuntimeEnvFromLocals(locals)),
    )
    return jsonResponse({ ok: true, detail }, 200)
  })
