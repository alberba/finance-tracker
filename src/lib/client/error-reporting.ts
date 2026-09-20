import * as Sentry from '@sentry/browser'

import { apiEndpointPath, type ApiClientError } from './api-error'

/**
 * Contrato de privacidad: a Sentry viajan solo la ruta del endpoint, la
 * categoría y el estado HTTP. Nunca el cuerpo de la petición o de la
 * respuesta, credenciales, `extra`, `contexts` ni datos de la persona.
 */
export function reportApiErrorToSentry(error: ApiClientError): void {
  Sentry.withScope((scope) => {
    scope.setTag('api.endpoint', apiEndpointPath(error.endpoint))
    scope.setTag('api.category', error.category)
    if (error.status !== undefined) scope.setTag('api.status', String(error.status))
    Sentry.captureException(error)
  })
}
