/**
 * Cliente de «Mis reportes» (#340).
 *
 * Mismo patrón que `issue-report-api.ts`: Effect sobre `ClientHttp`, un mensaje
 * castellano por flujo. En demo devuelve las fixtures y nunca llama a la API.
 */

import { Effect } from 'effect'

import type {
  ReportCommentResponse,
  ReportDetail,
  ReportDetailResponse,
  ReportsListResponse,
} from '../domain/reports/report-entry'
import { DEMO_REPORTS } from '../domain/reports/demo-reports'
import { requestApiJson, requestApiNoContent } from '../lib/client/api-client'
import type { ApiClientError } from '../lib/client/api-error'
import type { ClientHttp } from '../lib/client/http'
import { isDemoMode } from '../scripts/demo-mode'
import type { ReportAttachment } from './issue-report-api'

const LIST_ENDPOINT = '/api/reports'
const DEMO_MESSAGE = 'En la demo no se envían comentarios.'

export interface ReportCommentInput {
  text: string
  attachments?: ReportAttachment[]
}

export interface ReportCommentUpdateInput extends ReportCommentInput {
  keepAttachments: string[]
}

export type CommentMutationResult = ReportCommentResponse | { ok: false; error: string }

function detailPath(issueNumber: number): string {
  return `${LIST_ENDPOINT}/${issueNumber}`
}

/** Lista de la cuenta; en demo, las dos entradas ficticias. */
export const fetchReports = (): Effect.Effect<ReportsListResponse, ApiClientError, ClientHttp> => {
  if (isDemoMode()) {
    return Effect.succeed({
      ok: true,
      reports: DEMO_REPORTS.map((detail) => detail.report),
      hasMore: false,
      fetchedAt: DEMO_REPORTS[0].fetchedAt,
    })
  }
  return requestApiJson<ReportsListResponse>(LIST_ENDPOINT, {
    fallbackMessage: 'No se pudieron cargar tus reportes.',
  })
}

export const fetchReportDetail = (
  issueNumber: number,
): Effect.Effect<ReportDetailResponse, ApiClientError, ClientHttp> => {
  if (isDemoMode()) {
    const detail =
      DEMO_REPORTS.find((item) => item.report.number === issueNumber) ?? DEMO_REPORTS[0]
    return Effect.succeed({ ok: true, detail } satisfies ReportDetailResponse)
  }
  return requestApiJson<ReportDetailResponse>(detailPath(issueNumber), {
    fallbackMessage: 'No se pudo cargar el reporte.',
  })
}

/** La marca de lectura nunca bloquea la vista: un fallo no se muestra. */
export const markReportSeen = (
  issueNumber: number,
  seenAt: string,
): Effect.Effect<{ ok: true }, ApiClientError, ClientHttp> => {
  if (isDemoMode()) return Effect.succeed({ ok: true })
  return requestApiNoContent(`${detailPath(issueNumber)}/seen`, {
    method: 'POST',
    body: { seenAt },
    fallbackMessage: 'No se pudo guardar la lectura.',
  }).pipe(Effect.as({ ok: true }))
}

export const postReportComment = (
  issueNumber: number,
  input: ReportCommentInput,
): Effect.Effect<CommentMutationResult, ApiClientError, ClientHttp> => {
  if (isDemoMode()) return Effect.succeed({ ok: false, error: DEMO_MESSAGE })
  return requestApiJson<ReportCommentResponse>(`${detailPath(issueNumber)}/comments`, {
    method: 'POST',
    body: input,
    fallbackMessage: 'No se pudo publicar en GitHub. Tu texto sigue aquí; inténtalo de nuevo.',
  })
}

export const patchReportComment = (
  issueNumber: number,
  commentId: number,
  input: ReportCommentUpdateInput,
): Effect.Effect<CommentMutationResult, ApiClientError, ClientHttp> => {
  if (isDemoMode()) return Effect.succeed({ ok: false, error: DEMO_MESSAGE })
  return requestApiJson<ReportCommentResponse>(`${detailPath(issueNumber)}/comments/${commentId}`, {
    method: 'PATCH',
    body: input,
    fallbackMessage: 'No se pudo guardar en GitHub. Tu texto sigue aquí; inténtalo de nuevo.',
  })
}

export const deleteReportComment = (
  issueNumber: number,
  commentId: number,
): Effect.Effect<{ ok: true } | { ok: false; error: string }, ApiClientError, ClientHttp> => {
  if (isDemoMode()) return Effect.succeed({ ok: false, error: DEMO_MESSAGE })
  return requestApiNoContent(`${detailPath(issueNumber)}/comments/${commentId}`, {
    method: 'DELETE',
    fallbackMessage: 'No se pudo borrar la aclaración.',
  }).pipe(Effect.as({ ok: true } as const))
}

export type { ReportDetail }
