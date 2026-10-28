import type { APIRoute } from 'astro'
import { ZodError } from 'zod'

import { getDb } from '../../../../../db/client'
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
import { runServer } from '../../../../../lib/server/runtime'

/** `POST /api/reports/:number/comments` — publica una aclaración del reportero. */
export const POST: APIRoute = ({ locals, params, request }) =>
  runReportsRoute('/api/reports/[number]/comments', locals, async (principal) => {
    const issueNumber = parseNumericParam(params.number, ISSUE_NUMBER_PATTERN)
    if (issueNumber === null) throw invalidParam('number')
    if (!reportCommentLimiter.consume(principal.userId)) {
      return jsonResponse({ ok: false, error: RATE_LIMITED_MESSAGE }, 429)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw invalidPayload(new ZodError([]))
    }
    const parsed = createCommentSchema.safeParse(body)
    if (!parsed.success) throw invalidPayload(parsed.error)

    const comment = await runServer(
      getDb(locals),
      addComment(principal.userId, issueNumber, parsed.data, getRuntimeEnvFromLocals(locals)),
    )
    return jsonResponse({ ok: true, comment }, 201)
  })
