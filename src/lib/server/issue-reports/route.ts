/** Borde común de las rutas `/api/reports/**` (#340). */

import { ZodError } from 'zod'

import { requirePrincipal, withApiErrorHandling } from '../api-auth'
import type { AuthPrincipal } from '../auth/principal'
import { reportApiRouteFailure } from '../error-tracking'
import { ReportInputError, ReportsGithubError, reportsErrorResponse, isReportsError } from './errors'

export const ISSUE_NUMBER_PATTERN = /^\d{1,9}$/
export const COMMENT_ID_PATTERN = /^\d{1,15}$/

/** Número de URL validado; `null` cuando no cumple el patrón. */
export function parseNumericParam(value: string | undefined, pattern: RegExp): number | null {
  if (!value || !pattern.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function invalidParam(path: string): ReportInputError {
  return new ReportInputError({ message: 'Parámetro inválido.', status: 400, details: [{ path }] })
}

/** Convierte un error de zod en el 400 uniforme de la API. */
export function invalidPayload(error: ZodError): ReportInputError {
  return new ReportInputError({
    message: 'Payload inválido.',
    status: 400,
    details: error.issues,
  })
}

/**
 * Envuelve el cuerpo de una ruta: sesión obligatoria, errores de dominio con su
 * código y todo lo inesperado en `withApiErrorHandling` (500 + Sentry).
 */
export async function runReportsRoute(
  route: string,
  locals: App.Locals,
  handler: (principal: AuthPrincipal) => Promise<Response>,
): Promise<Response> {
  return withApiErrorHandling(route, async () => {
    const principal = requirePrincipal(locals)
    try {
      return await handler(principal)
    } catch (error) {
      if (isReportsError(error)) {
        if (error instanceof ReportsGithubError) {
          reportApiRouteFailure(error, { route, status: 502 })
        }
        return reportsErrorResponse(error)
      }
      throw error
    }
  })
}
