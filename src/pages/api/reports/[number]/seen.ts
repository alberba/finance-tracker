import type { APIRoute } from 'astro'
import { z, ZodError } from 'zod'

import { getDb } from '../../../../db/client'
import {
  invalidParam,
  invalidPayload,
  ISSUE_NUMBER_PATTERN,
  parseNumericParam,
  runReportsRoute,
} from '../../../../lib/server/issue-reports/route'
import { markSeen } from '../../../../lib/server/issue-reports/service'
import { runServer } from '../../../../lib/server/runtime'

const seenSchema = z.object({ seenAt: z.iso.datetime() })

/** `POST /api/reports/:number/seen` — marca de lectura del cliente, recortada a «ahora». */
export const POST: APIRoute = ({ locals, params, request }) =>
  runReportsRoute('/api/reports/[number]/seen', locals, async (principal) => {
    const issueNumber = parseNumericParam(params.number, ISSUE_NUMBER_PATTERN)
    if (issueNumber === null) throw invalidParam('number')

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw invalidPayload(new ZodError([]))
    }
    const parsed = seenSchema.safeParse(body)
    if (!parsed.success) throw invalidPayload(parsed.error)

    await runServer(
      getDb(locals),
      markSeen(principal.userId, issueNumber, parsed.data.seenAt),
    )
    return new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    })
  })
