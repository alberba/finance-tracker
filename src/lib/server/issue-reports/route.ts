/** Borde común de las rutas `/api/reports/**` (#340). */

import { Effect } from 'effect'
import { ZodError } from 'zod'

import { getDb } from '../../../db/client'
import { Database, type DatabaseError } from '../../../db/database'
import type { Http } from '../http'
import { requirePrincipal, withApiErrorHandling } from '../api-auth'
import type { AuthPrincipal } from '../auth/principal'
import { reportApiRouteFailure } from '../error-tracking'
import { runServer } from '../runtime'
import {
  ReportInputError,
  ReportsGithubError,
  reportsErrorResponse,
  isReportsError,
} from './errors'
import type { ReportsError } from './errors'

export const ISSUE_NUMBER_PATTERN = /^\d{1,9}$/
export const COMMENT_ID_PATTERN = /^\d{1,15}$/
/** `submittedAt|issueNumber`, el cursor opaco de la lista. */
export const LIST_CURSOR_PATTERN = /^(\d{4}-\d{2}-\d{2}T[0-9:.]+Z)\|(\d{1,9})$/

/** Número de URL validado; `null` cuando no cumple el patrón. */
export function parseNumericParam(value: string | undefined, pattern: RegExp): number | null {
  if (!value || !pattern.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

/** Cursor de la lista (`submittedAt|número`); `null` cuando no es válido. */
export function parseListCursor(
  value: string | null | undefined,
): { submittedAt: string; issueNumber: number } | null {
  if (!value) return null
  const match = LIST_CURSOR_PATTERN.exec(value)
  if (!match) return null
  const issueNumber = Number(match[2])
  return Number.isSafeInteger(issueNumber) && issueNumber > 0
    ? { submittedAt: match[1], issueNumber }
    : null
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
 *
 * El cuerpo es un `Effect`, no una `Promise`: este helper es el borde donde se
 * ejecuta, igual que `runServer` en el resto de endpoints.
 */
export function runReportsRoute(
  route: string,
  locals: App.Locals,
  handler: (
    principal: AuthPrincipal,
  ) => Effect.Effect<Response, ReportsError | DatabaseError, Database | Http>,
): Promise<Response> {
  return withApiErrorHandling(route, async () => {
    const principal = requirePrincipal(locals)
    const handled = handler(principal).pipe(
      Effect.catchIf(isReportsError, (error) => {
        if (error instanceof ReportsGithubError) {
          reportApiRouteFailure(error, { route, status: 502 })
        }
        return Effect.succeed(reportsErrorResponse(error))
      }),
    )
    return runServer(getDb(locals), handled)
  })
}
