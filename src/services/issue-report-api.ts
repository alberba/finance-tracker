import { Effect } from 'effect'

import { requestApiJson } from '../lib/client/api-client'
import type { ClientHttp } from '../lib/client/http'
import { isDemoMode } from '../scripts/demo-mode'

export type ReportType = 'bug' | 'feature' | 'enhancement'

/** Imagen en base64 dentro del mismo JSON; el servidor vuelve a validarla. */
export interface ReportAttachment {
  name: string
  contentType: string
  data: string
}

export interface ReportPayload {
  type: ReportType
  summary: string
  /** Opcional: se omite del payload cuando la persona no escribe nada. */
  description?: string
  section: string
  context: {
    userAgent: string
    pathname: string
    timestamp: string
  }
  /** Opcional: se omite del payload cuando no hay capturas. */
  attachments?: ReportAttachment[]
}

interface ReportResponseOk {
  ok: true
  issueNumber: number
  issueUrl: string
  duplicate?: boolean
}

interface ReportResponseError {
  ok: false
  error: string
}

export type ReportResponse = ReportResponseOk | ReportResponseError

export const ISSUE_REPORT_ENDPOINT = '/api/issues/report'

const FALLBACK_MESSAGE = 'No se pudo crear la issue.'

export const submitIssueReport = (
  payload: ReportPayload,
): Effect.Effect<ReportResponse, never, ClientHttp> => {
  if (isDemoMode()) {
    return Effect.succeed({
      ok: false,
      error: 'Los reportes no se envían desde el modo demo.',
    })
  }

  return requestApiJson<ReportResponse>(ISSUE_REPORT_ENDPOINT, {
    method: 'POST',
    body: payload,
    fallbackMessage: FALLBACK_MESSAGE,
  }).pipe(
    Effect.match({
      onFailure: (error) => ({ ok: false, error: error.message }) as const,
      onSuccess: (body) => body,
    }),
  )
}
