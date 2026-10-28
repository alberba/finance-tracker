/**
 * Errores de «Mis reportes» (#340) y su traducción a respuestas JSON.
 *
 * `reportsErrorResponse` es el único lugar que decide el código HTTP; lo que no
 * es un error de dominio cae en `withApiErrorHandling` (500 + Sentry).
 */

import { Data } from 'effect'

import { jsonResponse } from '../api-auth'

export class ReportsGithubError extends Data.TaggedError('ReportsGithubError')<{
  message: string
  status?: number
}> {}

export class ReportNotFoundError extends Data.TaggedError('ReportNotFoundError')<{
  message: string
}> {}

export class ReportClosedError extends Data.TaggedError('ReportClosedError')<{
  message: string
}> {}

export class CommentForbiddenError extends Data.TaggedError('CommentForbiddenError')<{
  message: string
}> {}

export class ReportInputError extends Data.TaggedError('ReportInputError')<{
  message: string
  status: number
  details?: unknown
}> {}

export type ReportsError =
  | ReportsGithubError
  | ReportNotFoundError
  | ReportClosedError
  | CommentForbiddenError
  | ReportInputError

export const REPORT_NOT_FOUND_MESSAGE = 'Reporte no encontrado.'
export const REPORT_CLOSED_MESSAGE = 'El reporte está cerrado: el hilo es de solo lectura.'
export const COMMENT_FORBIDDEN_MESSAGE = 'No puedes modificar este comentario.'
export const RATE_LIMITED_MESSAGE = 'Demasiadas peticiones. Inténtalo en un minuto.'

export function reportsErrorResponse(error: ReportsError): Response {
  if (error instanceof ReportNotFoundError) {
    return jsonResponse({ ok: false, error: REPORT_NOT_FOUND_MESSAGE }, 404)
  }
  if (error instanceof ReportClosedError) {
    return jsonResponse({ ok: false, error: REPORT_CLOSED_MESSAGE }, 409)
  }
  if (error instanceof CommentForbiddenError) {
    return jsonResponse({ ok: false, error: COMMENT_FORBIDDEN_MESSAGE }, 403)
  }
  if (error instanceof ReportInputError) {
    return jsonResponse(
      { ok: false, error: error.message, ...(error.details ? { details: error.details } : {}) },
      error.status,
    )
  }
  return jsonResponse(
    { ok: false, error: 'No se pudo consultar GitHub. Inténtalo de nuevo.' },
    502,
  )
}

export function isReportsError(error: unknown): error is ReportsError {
  return (
    error instanceof ReportsGithubError ||
    error instanceof ReportNotFoundError ||
    error instanceof ReportClosedError ||
    error instanceof CommentForbiddenError ||
    error instanceof ReportInputError
  )
}
