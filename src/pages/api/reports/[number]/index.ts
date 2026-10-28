import { Effect } from 'effect'
import type { APIRoute } from 'astro'

import { jsonResponse } from '../../../../lib/server/api-auth'
import { getRuntimeEnvFromLocals } from '../../../../lib/server/cloudflare-env'
import {
  invalidParam,
  ISSUE_NUMBER_PATTERN,
  parseNumericParam,
  runReportsRoute,
} from '../../../../lib/server/issue-reports/route'
import { getReportDetail } from '../../../../lib/server/issue-reports/service'

/** `GET /api/reports/:number` — estado e hilo del reporte propio. */
export const GET: APIRoute = ({ locals, params }) =>
  runReportsRoute('/api/reports/[number]', locals, (principal) => {
    const issueNumber = parseNumericParam(params.number, ISSUE_NUMBER_PATTERN)
    if (issueNumber === null) return Effect.fail(invalidParam('number'))
    return Effect.gen(function* () {
      const detail = yield* getReportDetail(
        principal.userId,
        issueNumber,
        getRuntimeEnvFromLocals(locals),
      )
      return jsonResponse({ ok: true, detail }, 200)
    })
  })
