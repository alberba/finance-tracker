import { Effect } from 'effect'
import type { APIRoute } from 'astro'

import { jsonResponse } from '../../../lib/server/api-auth'
import { getRuntimeEnvFromLocals } from '../../../lib/server/cloudflare-env'
import { RATE_LIMITED_MESSAGE } from '../../../lib/server/issue-reports/errors'
import {
  invalidParam,
  parseListCursor,
  runReportsRoute,
} from '../../../lib/server/issue-reports/route'
import { listReports } from '../../../lib/server/issue-reports/service'
import { reportListLimiter } from '../../../lib/server/rate-limit'

/**
 * `GET /api/reports` — los reportes de la cuenta autenticada, leídos de GitHub.
 * `cursor` continúa la página anterior; la primera incluye el contador global.
 */
export const GET: APIRoute = ({ locals, request }) =>
  runReportsRoute('/api/reports', locals, (principal) => {
    if (!reportListLimiter.consume(principal.userId)) {
      return Effect.succeed(jsonResponse({ ok: false, error: RATE_LIMITED_MESSAGE }, 429))
    }
    const rawCursor = new URL(request.url).searchParams.get('cursor')
    const cursor = parseListCursor(rawCursor)
    if (rawCursor && !cursor) return Effect.fail(invalidParam('cursor'))
    return Effect.gen(function* () {
      const result = yield* listReports(
        principal.userId,
        getRuntimeEnvFromLocals(locals),
        cursor ? { cursor } : {},
      )
      return jsonResponse({ ok: true, ...result }, 200)
    })
  })
