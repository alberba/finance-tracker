import type { APIRoute } from 'astro'
import { ZodError } from 'zod'

import { getDb } from '../../../../../db/client'
import { jsonResponse } from '../../../../../lib/server/api-auth'
import { getRuntimeEnvFromLocals } from '../../../../../lib/server/cloudflare-env'
import { updateCommentSchema } from '../../../../../lib/server/issue-reports/comment-schema'
import { RATE_LIMITED_MESSAGE } from '../../../../../lib/server/issue-reports/errors'
import {
  COMMENT_ID_PATTERN,
  invalidParam,
  invalidPayload,
  ISSUE_NUMBER_PATTERN,
  parseNumericParam,
  runReportsRoute,
} from '../../../../../lib/server/issue-reports/route'
import {
  deleteComment,
  editComment,
} from '../../../../../lib/server/issue-reports/service'
import { reportCommentLimiter } from '../../../../../lib/server/rate-limit'
import { runServer } from '../../../../../lib/server/runtime'

/** `PATCH /api/reports/:number/comments/:commentId` — edita una aclaración propia. */
export const PATCH: APIRoute = ({ locals, params, request }) =>
  runReportsRoute('/api/reports/[number]/comments/[commentId]', locals, async (principal) => {
    const issueNumber = parseNumericParam(params.number, ISSUE_NUMBER_PATTERN)
    const commentId = parseNumericParam(params.commentId, COMMENT_ID_PATTERN)
    if (issueNumber === null) throw invalidParam('number')
    if (commentId === null) throw invalidParam('commentId')
    if (!reportCommentLimiter.consume(principal.userId)) {
      return jsonResponse({ ok: false, error: RATE_LIMITED_MESSAGE }, 429)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw invalidPayload(new ZodError([]))
    }
    const parsed = updateCommentSchema.safeParse(body)
    if (!parsed.success) throw invalidPayload(parsed.error)

    const comment = await runServer(
      getDb(locals),
      editComment(
        principal.userId,
        issueNumber,
        commentId,
        parsed.data,
        getRuntimeEnvFromLocals(locals),
      ),
    )
    return jsonResponse({ ok: true, comment }, 200)
  })

/** `DELETE /api/reports/:number/comments/:commentId` — borra la aclaración de GitHub. */
export const DELETE: APIRoute = ({ locals, params }) =>
  runReportsRoute('/api/reports/[number]/comments/[commentId]', locals, async (principal) => {
    const issueNumber = parseNumericParam(params.number, ISSUE_NUMBER_PATTERN)
    const commentId = parseNumericParam(params.commentId, COMMENT_ID_PATTERN)
    if (issueNumber === null) throw invalidParam('number')
    if (commentId === null) throw invalidParam('commentId')
    if (!reportCommentLimiter.consume(principal.userId)) {
      return jsonResponse({ ok: false, error: RATE_LIMITED_MESSAGE }, 429)
    }

    await runServer(
      getDb(locals),
      deleteComment(principal.userId, issueNumber, commentId, getRuntimeEnvFromLocals(locals)),
    )
    return new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    })
  })
