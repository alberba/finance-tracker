import { ApiClientError } from '../lib/client/api-error'
import { requestApiJson } from '../lib/client/api-client'
import { isDemoMode } from '../scripts/demo-mode'

export type ReportType = 'bug' | 'feature' | 'enhancement'

export interface ReportPayload {
  type: ReportType
  summary: string
  description: string
  mentionClaude: boolean
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
  enrichmentStatus?: 'pending' | 'completed'
}

interface ReportResponseError {
  ok: false
  error: string
}

export type ReportResponse = ReportResponseOk | ReportResponseError

export type ReportSubmissionPayload = Omit<ReportPayload, 'mentionClaude'> & {
  mentionClaude?: boolean
}

export const ISSUE_REPORT_ENDPOINT = '/api/issues/report'

const FALLBACK_MESSAGE = 'No se pudo crear la issue.'

export async function submitIssueReport(payload: ReportSubmissionPayload): Promise<ReportResponse> {
  if (isDemoMode()) {
    return { ok: false, error: 'Los reportes no se envían desde el modo demo.' }
  }

  try {
    return await requestApiJson<ReportResponse>(ISSUE_REPORT_ENDPOINT, {
      method: 'POST',
      body: payload,
      fallbackMessage: FALLBACK_MESSAGE,
    })
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ApiClientError ? error.message : FALLBACK_MESSAGE,
    }
  }
}
