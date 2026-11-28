import type { APIRoute } from 'astro'
import { ZodError } from 'zod'

import { getDb } from '../../../db/client'
import { getByUserAndNumber } from '../../../db/repositories/issue-reports'
import * as privateReports from '../../../db/repositories/private-reports'
import { signReportReceipt, verifyReportReceipt } from '../../../lib/server/issue-reports/receipt'
import { reportScreenSchema } from '../../../lib/server/report-diagnostic-schema'
import { jsonResponse, requirePrincipal, withApiErrorHandling } from '../../../lib/server/api-auth'
import { getRuntimeEnvFromLocals } from '../../../lib/server/cloudflare-env'
import { reportApiRouteFailure, reportReportSideFailure } from '../../../lib/server/error-tracking'
import { createIssueFromWebReport } from '../../../lib/server/github-issues'
import { parseIssueReportPayload } from '../../../lib/server/issue-report-schema'
import { reportSubmissionLimiter } from '../../../lib/server/rate-limit'
import { runHttp, runServer } from '../../../lib/server/runtime'

const ROUTE = '/api/issues/report'

export const POST: APIRoute = async ({ request, locals }) =>
  withApiErrorHandling(ROUTE, async () => {
    const principal = requirePrincipal(locals)
    if (!reportSubmissionLimiter.consume(principal.userId)) {
      return jsonResponse({ ok: false, error: 'Rate limit excedido. Intenta en un minuto.' }, 429)
    }

    try {
      const payload = parseIssueReportPayload(await request.json())
      const db = getDb(locals)
      const now = new Date().toISOString()
      await runServer(db, privateReports.purgeExpired(now))

      const env = getRuntimeEnvFromLocals(locals)
      const recovered = payload.receipt
        ? await verifyReportReceipt(payload.receipt, principal.userId, env.BETTER_AUTH_SECRET)
        : null
      if (payload.receipt && !recovered) {
        return jsonResponse(
          { ok: false, error: 'La referencia de recuperación ha caducado o es inválida.' },
          400,
        )
      }

      const screen = reportScreenSchema.safeParse(payload.section).data ?? 'unknown'
      const reference = recovered?.reference ?? crypto.randomUUID()
      const created =
        recovered ??
        (await runHttp(
          createIssueFromWebReport(
            { type: payload.type, screen, reference, topic: payload.topic },
            env,
          ),
        ))
      const response = { ok: true, issueNumber: created.number, issueUrl: created.url }

      if (recovered) {
        const existing = await runServer(db, getByUserAndNumber(principal.userId, recovered.number))
        if (existing?.caseReference === reference) {
          return jsonResponse({ ...response, tracked: true }, 201)
        }
      }
      let tracked = true
      try {
        await runServer(
          db,
          privateReports.saveSubmission(principal.userId, {
            caseReference: reference,
            issueNumber: created.number,
            submittedAt: now,
            title: payload.summary,
            body: payload.description,
            diagnostic: payload.diagnostic,
            attachments: payload.attachments ?? [],
          }),
        )
      } catch {
        // The GitHub issue already exists. The client keeps the private draft.
        tracked = false
        reportReportSideFailure({ stage: 'track', reason: 'db' })
      }

      const receipt = tracked
        ? undefined
        : (payload.receipt ??
          (await signReportReceipt(
            { ...created, reference },
            principal.userId,
            env.BETTER_AUTH_SECRET,
          )))
      return jsonResponse({ ...response, tracked, receipt }, 201)
    } catch (error) {
      if (error instanceof ZodError || error instanceof SyntaxError) {
        return jsonResponse({ ok: false, error: 'Payload inválido.' }, 400)
      }
      reportApiRouteFailure(new Error('No se pudo crear el reporte web.'), {
        route: ROUTE,
        status: 500,
      })
      return jsonResponse({ ok: false, error: 'No se pudo crear la issue' }, 500)
    }
  })
