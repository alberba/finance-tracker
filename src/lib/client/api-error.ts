/**
 * Cómo se cuenta un fallo de una llamada interna a `/api/**`.
 *
 * Módulo puro a propósito: no hace `fetch`, no habla con Sentry y no toca el
 * DOM. `api-client.ts` construye estos errores y `error-reporting.ts` decide
 * qué viaja a Sentry; acá solo viven la categoría, el texto en castellano que
 * ve la persona y la regla de qué se reporta.
 */

export type ApiErrorCategory =
  /** El `fetch` rechazó: nunca hubo respuesta HTTP. */
  | 'offline'
  /** 401 del borde. */
  | 'session-expired'
  /** El cuerpo no era el JSON que el cliente espera. */
  | 'invalid-response'
  /** 5xx. */
  | 'server-error'
  /** 4xx que la propia API explicó. */
  | 'api-error'

export interface ApiErrorInit {
  endpoint: string
  status?: number
  /** Campo `error` de una respuesta JSON de error, cuando la API mandó uno. */
  serverMessage?: string
  /** Mensaje castellano del flujo, usado cuando la API no mandó mensaje propio. */
  fallbackMessage: string
}

export const OFFLINE_MESSAGE =
  'No hay conexión con el servidor. Revisa tu conexión e inténtalo de nuevo.'

export const SESSION_EXPIRED_MESSAGE = 'Tu sesión venció. Vuelve a entrar o recarga la página.'

export const INVALID_RESPONSE_MESSAGE =
  'El servidor devolvió una respuesta que no se pudo interpretar.'

export const SERVER_ERROR_MESSAGE =
  'El servidor falló al atender la petición. Inténtalo de nuevo en unos minutos.'

const CATEGORY_DEFAULT_MESSAGES: Record<
  'offline' | 'session-expired' | 'invalid-response',
  string
> = {
  offline: OFFLINE_MESSAGE,
  'session-expired': SESSION_EXPIRED_MESSAGE,
  'invalid-response': INVALID_RESPONSE_MESSAGE,
}

function resolveMessage(category: ApiErrorCategory, init: ApiErrorInit): string {
  const serverMessage = init.serverMessage?.trim()
  if (category === 'server-error') return serverMessage || SERVER_ERROR_MESSAGE
  if (category === 'api-error') return serverMessage || init.fallbackMessage
  return CATEGORY_DEFAULT_MESSAGES[category]
}

export class ApiClientError extends Error {
  readonly category: ApiErrorCategory
  readonly endpoint: string
  readonly status?: number

  constructor(category: ApiErrorCategory, init: ApiErrorInit) {
    super(resolveMessage(category, init))
    this.name = 'ApiClientError'
    this.category = category
    this.endpoint = init.endpoint
    this.status = init.status
  }
}

/** Traduce el estado HTTP a la única categoría que le corresponde. */
export function categoryForStatus(status: number): ApiErrorCategory {
  if (status === 401) return 'session-expired'
  if (status >= 500) return 'server-error'
  return 'api-error'
}

/**
 * Solo la ruta, sin `?query` ni `#hash`: este valor viaja como tag a Sentry,
 * así que nunca puede llevar datos de la consulta.
 */
export function apiEndpointPath(endpoint: string): string {
  const cut = endpoint.search(/[?#]/)
  return cut === -1 ? endpoint : endpoint.slice(0, cut)
}

/**
 * `api-error` es el rechazo que la API ya explicó (validación, credencial
 * faltante, límite de uso) y que el servidor ya registra; todo lo demás no es
 * culpa de quien usa la app y por eso sí se reporta.
 */
export function shouldReportApiError(error: ApiClientError): boolean {
  return error.category !== 'api-error'
}
