import type { APIRoute } from 'astro'
import { ZodError } from 'zod'

import { getDb } from '../../../db/client'
import * as issueReportsRepository from '../../../db/repositories/issue-reports'
import { requirePrincipal, withApiErrorHandling } from '../../../lib/server/api-auth'
import { getRuntimeEnvFromLocals } from '../../../lib/server/cloudflare-env'
import { reportApiRouteFailure, reportReportSideFailure } from '../../../lib/server/error-tracking'
import { createIssueFromWebReport } from '../../../lib/server/github-issues'
import { parseIssueReportPayload } from '../../../lib/server/issue-report-schema'
import { reportSubmissionLimiter } from '../../../lib/server/rate-limit'
import { runHttp, runServer } from '../../../lib/server/runtime'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

export const POST: APIRoute = async ({ request, locals }) =>
  withApiErrorHandling('/api/issues/report', async () => {
    const principal = requirePrincipal(locals)
    if (!reportSubmissionLimiter.consume(principal.userId)) {
      return jsonResponse({ ok: false, error: 'Rate limit excedido. Intenta en un minuto.' }, 429)
    }

    try {
      const body = await request.json()
      const payload = parseIssueReportPayload(body)
      const env = getRuntimeEnvFromLocals(locals)
      // El reportero sale siempre del principal autenticado: lo que traiga el
      // payload no puede sobrescribirlo.
      const reporter = {
        userId: principal.userId,
        email: principal.email,
        name: principal.name ?? null,
      }
      const created = await runHttp(createIssueFromWebReport(payload, reporter, env))

      // La propiedad es lo único que guarda el servidor; si falla, la issue ya
      // existe y el acuse lo dice sin reintentar la creación ([D7]).
      let tracked = true
      try {
        await runServer(
          getDb(locals),
          issueReportsRepository.recordSubmission(
            principal.userId,
            created.number,
            new Date().toISOString(),
          ),
        )
      } catch (error) {
        tracked = false
        console.error('[issues/report] No se pudo registrar la propiedad del reporte', error)
        reportReportSideFailure({ stage: 'track', reason: 'db' })
      }

      return jsonResponse(
        {
          ok: true,
          issueNumber: created.number,
          issueUrl: created.url,
          tracked,
        },
        201,
      )
    } catch (error) {
      if (error instanceof ZodError) {
        return jsonResponse({ ok: false, error: 'Payload inválido.', details: error.issues }, 400)
      }
      console.error('[issues/report] Issue creation failed', error)
      // El catch resuelve la respuesta, así que `withApiErrorHandling` nunca ve
      // este fallo: se reporta acá, una sola vez y con la misma forma.
      reportApiRouteFailure(error, { route: '/api/issues/report', status: 500 })
      return jsonResponse({ ok: false, error: 'No se pudo crear la issue' }, 500)
    }
  })
