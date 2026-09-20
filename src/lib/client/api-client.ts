/**
 * El único camino por el que una llamada interna a `/api/**` se convierte en
 * `ApiClientError`. Cada fallo se reporta a Sentry acá, una sola vez y antes
 * de rechazar, para que ningún wrapper pueda olvidarlo ni duplicarlo.
 */

import {
  ApiClientError,
  categoryForStatus,
  shouldReportApiError,
  type ApiErrorCategory,
} from './api-error'
import { reportApiErrorToSentry } from './error-reporting'

export interface ApiRequestInit {
  method?: string
  body?: unknown
  /** Mensaje castellano para las categorías en que la API no mandó mensaje propio. */
  fallbackMessage: string
}

function buildRequestInit(init: ApiRequestInit): RequestInit {
  const hasBody = init.body !== undefined
  return {
    method: init.method ?? 'GET',
    headers: hasBody
      ? { Accept: 'application/json', 'Content-Type': 'application/json' }
      : { Accept: 'application/json' },
    ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
  }
}

/** Reporta el error si corresponde y lo devuelve para poder lanzarlo en la misma línea. */
function reported(error: ApiClientError): ApiClientError {
  if (shouldReportApiError(error)) reportApiErrorToSentry(error)
  return error
}

function buildError(
  category: ApiErrorCategory,
  endpoint: string,
  init: ApiRequestInit,
  options: { status?: number; serverMessage?: string } = {},
): ApiClientError {
  return new ApiClientError(category, {
    endpoint,
    status: options.status,
    serverMessage: options.serverMessage,
    fallbackMessage: init.fallbackMessage,
  })
}

/** El campo `error` de la respuesta, solo cuando es un string con contenido. */
function serverMessageFrom(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const candidate = (body as { error?: unknown }).error
  return typeof candidate === 'string' && candidate.trim() ? candidate : undefined
}

export async function requestApiJson<T>(endpoint: string, init: ApiRequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(endpoint, buildRequestInit(init))
  } catch {
    throw reported(buildError('offline', endpoint, init))
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw reported(buildError('invalid-response', endpoint, init, { status: response.status }))
  }

  if (!response.ok) {
    throw reported(
      buildError(categoryForStatus(response.status), endpoint, init, {
        status: response.status,
        serverMessage: serverMessageFrom(body),
      }),
    )
  }

  return body as T
}
