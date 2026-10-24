import { Effect } from 'effect'

import { requestApiJson } from '../lib/client/api-client'
import type { ClientHttp } from '../lib/client/http'
import { isDemoMode } from '../scripts/demo-mode'

export type ReportType = 'bug' | 'feature' | 'enhancement'

export interface ReportPayload {
  type: ReportType
  summary: string
  description: string
  section: string
  context: {
    userAgent: string
    pathname: string
    timestamp: string
  }
  stepsToReproduce?: string
  expectedResult?: string
  actualResult?: string
}

interface ReportResponseOk {
  ok: true
  issueNumber: number
  issueUrl: string
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
