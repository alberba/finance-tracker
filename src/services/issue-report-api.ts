import { ApiClientError } from '../lib/client/api-error'
import { requestApiJson } from '../lib/client/api-client'
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

export async function submitIssueReport(payload: ReportPayload): Promise<ReportResponse> {
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
