/**
 * El embudo único de los wrappers que consumen la API interna
 * (`issue-report-api.ts`, `stockevents-api.ts`): acá una respuesta se convierte
 * en `ApiClientError`, y cada fallo que este embudo clasifica se reporta a
 * Sentry una sola vez y antes de rechazar.
 *
 * No es el único camino del proyecto hacia `/api/**`: `src/services/market-api.ts`,
 * `src/lib/client/state-initialize.ts` y `src/stores/sync.ts` todavía llaman a
 * `fetch` directamente. Y un wrapper que detecta por su cuenta un contrato roto
 * (el 2xx sin transacción de `stockevents-api.ts`) reporta ese caso con este
 * mismo reporter, exactamente una vez; acá no se re-reporta.
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

/**
 * Reporta el error si corresponde —solo los fallos que clasifica este embudo—
 * y lo devuelve para poder lanzarlo en la misma línea.
 */
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

/** El cuerpo no era JSON parseable: distinto de "JSON que no trae lo esperado". */
const NOT_JSON = Symbol('not-json')

/**
 * Lee el cuerpo como JSON sin lanzar: devuelve el valor o el centinela de
 * "no era JSON". Clasificar por el estado HTTP primero exige que un cuerpo que
 * no parsea no interrumpa la lectura.
 */
async function readJsonBody(response: Response): Promise<unknown | typeof NOT_JSON> {
  try {
    return await response.json()
  } catch {
    return NOT_JSON
  }
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

  const body = await readJsonBody(response)

  if (!response.ok) {
    throw reported(
      buildError(categoryForStatus(response.status), endpoint, init, {
        status: response.status,
        serverMessage: serverMessageFrom(body),
      }),
    )
  }

  if (body === NOT_JSON) {
    throw reported(buildError('invalid-response', endpoint, init, { status: response.status }))
  }

  return body as T
}
