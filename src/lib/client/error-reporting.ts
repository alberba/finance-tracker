import * as Sentry from '@sentry/browser'

import { apiEndpointPath, apiErrorTitle, type ApiClientError } from './api-error'

let latestEvent: { id: string; time: number; page: string } | undefined

export function recentApiErrorEventId(): string | undefined {
  if (
    typeof window !== 'undefined' &&
    latestEvent?.page === window.location.pathname &&
    Date.now() - latestEvent.time < 15 * 60 * 1000
  )
    return latestEvent.id
  return undefined
}

/**
 * Contrato de privacidad: a Sentry viajan solo el resumen que armamos
 * (`apiErrorTitle`) y los tags de ruta, categoría y estado. Nunca el mensaje de
 * la API, cuerpos de petición o de respuesta, credenciales, `extra`,
 * `contexts` ni datos de la persona.
 */
export function reportApiErrorToSentry(error: ApiClientError): void {
  try {
    Sentry.withScope((scope) => {
      scope.setTag('api.endpoint', apiEndpointPath(error.endpoint))
      scope.setTag('api.category', error.category)
      if (error.status !== undefined) scope.setTag('api.status', String(error.status))
      const id = Sentry.captureException(new Error(apiErrorTitle(error)))
      if (typeof window !== 'undefined' && /^[0-9a-f]{32}$/.test(id)) {
        latestEvent = { id, time: Date.now(), page: window.location.pathname }
      }
    })
  } catch {
    // El reporte es best-effort: si el SDK falla, el error tipado ya clasificado
    // tiene que seguir su curso y llegar entero a quien lo vaya a mostrar. Por
    // eso no se relanza, y tampoco se loguea el fallo del SDK, que puede traer
    // datos del propio evento.
    console.warn('[error-reporting] No se pudo reportar el fallo de API a Sentry')
  }
}
