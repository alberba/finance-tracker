import { Effect } from 'effect'
import type { APIRoute } from 'astro'
import { z, ZodError } from 'zod'

import {
  invalidParam,
  invalidPayload,
  ISSUE_NUMBER_PATTERN,
  parseNumericParam,
  runReportsRoute,
} from '../../../../lib/server/issue-reports/route'
import { markSeen } from '../../../../lib/server/issue-reports/service'

const seenSchema = z.object({ seenAt: z.iso.datetime() })

function noContent(): Response {
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}

/** `POST /api/reports/:number/seen` — marca de lectura del cliente, recortada a «ahora». */
export const POST: APIRoute = ({ locals, params, request }) =>
  runReportsRoute('/api/reports/[number]/seen', locals, (principal) => {
    const issueNumber = parseNumericParam(params.number, ISSUE_NUMBER_PATTERN)
    if (issueNumber === null) return Effect.fail(invalidParam('number'))

    return Effect.gen(function* () {
      const body = yield* Effect.tryPromise({
        try: () => request.json() as Promise<unknown>,
        catch: () => invalidPayload(new ZodError([])),
      })
      const parsed = seenSchema.safeParse(body)
      if (!parsed.success) return yield* invalidPayload(parsed.error)

      yield* markSeen(principal.userId, issueNumber, parsed.data.seenAt)
      return noContent()
    })
  })
