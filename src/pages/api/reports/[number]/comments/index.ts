import { Effect } from 'effect'
import type { APIRoute } from 'astro'
import { ZodError } from 'zod'

import { jsonResponse } from '../../../../../lib/server/api-auth'
import { getRuntimeEnvFromLocals } from '../../../../../lib/server/cloudflare-env'
import { createCommentSchema } from '../../../../../lib/server/issue-reports/comment-schema'
import { RATE_LIMITED_MESSAGE } from '../../../../../lib/server/issue-reports/errors'
import {
  invalidParam,
  invalidPayload,
  ISSUE_NUMBER_PATTERN,
  parseNumericParam,
  runReportsRoute,
} from '../../../../../lib/server/issue-reports/route'
import { addComment } from '../../../../../lib/server/issue-reports/service'
import { reportCommentLimiter } from '../../../../../lib/server/rate-limit'

/** `POST /api/reports/:number/comments` — publica una aclaración del reportero. */
export const POST: APIRoute = ({ locals, params, request }) =>
  runReportsRoute('/api/reports/[number]/comments', locals, (principal) => {
    const issueNumber = parseNumericParam(params.number, ISSUE_NUMBER_PATTERN)
    if (issueNumber === null) return Effect.fail(invalidParam('number'))
    if (!reportCommentLimiter.consume(principal.userId)) {
      return Effect.succeed(jsonResponse({ ok: false, error: RATE_LIMITED_MESSAGE }, 429))
    }

    return Effect.gen(function* () {
      const body = yield* Effect.tryPromise({
        try: () => request.json() as Promise<unknown>,
        catch: () => invalidPayload(new ZodError([])),
      })
      const parsed = createCommentSchema.safeParse(body)
      if (!parsed.success) return yield* invalidPayload(parsed.error)

      const comment = yield* addComment(
        principal.userId,
        issueNumber,
        parsed.data,
        getRuntimeEnvFromLocals(locals),
      )
      return jsonResponse({ ok: true, comment }, 201)
    })
  })
