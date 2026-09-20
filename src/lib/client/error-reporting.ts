import * as Sentry from '@sentry/browser'

import { apiEndpointPath, apiErrorTitle, type ApiClientError } from './api-error'

/**
 * Contrato de privacidad: a Sentry viajan solo el resumen que armamos
 * (`apiErrorTitle`) y los tags de ruta, categoría y estado. Nunca el mensaje de
 * la API, cuerpos de petición o de respuesta, credenciales, `extra`,
 * `contexts` ni datos de la persona.
 */
export function reportApiErrorToSentry(error: ApiClientError): void {
  Sentry.withScope((scope) => {
    scope.setTag('api.endpoint', apiEndpointPath(error.endpoint))
    scope.setTag('api.category', error.category)
    if (error.status !== undefined) scope.setTag('api.status', String(error.status))
    Sentry.captureException(new Error(apiErrorTitle(error)))
  })
}
