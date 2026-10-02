import { describe, expect, it } from 'vitest'

import {
  ApiClientError,
  INVALID_RESPONSE_MESSAGE,
  OFFLINE_MESSAGE,
  SERVER_ERROR_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  apiEndpointPath,
  categoryForStatus,
  shouldReportApiError,
  type ApiErrorCategory,
} from '../../src/lib/client/api-error'

const FALLBACK_MESSAGE = 'No se pudieron cargar los eventos'

function makeError(category: ApiErrorCategory, serverMessage?: string): ApiClientError {
  return new ApiClientError(category, {
    endpoint: '/api/stockevents',
    status: 400,
    serverMessage,
    fallbackMessage: FALLBACK_MESSAGE,
  })
}

describe('mensajes por categoría', () => {
  it('fija el texto exacto de cada mensaje por defecto', () => {
    expect(OFFLINE_MESSAGE).toBe(
      'No hay conexión con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    )
    expect(SESSION_EXPIRED_MESSAGE).toBe('Tu sesión venció. Vuelve a entrar o recarga la página.')
    expect(INVALID_RESPONSE_MESSAGE).toBe(
      'El servidor devolvió una respuesta que no se pudo interpretar.',
    )
    expect(SERVER_ERROR_MESSAGE).toBe(
      'El servidor falló al atender la petición. Inténtalo de nuevo en unos minutos.',
    )
  })

  it('explica la falta de conexión cuando el fetch no llegó a responder', () => {
    expect(makeError('offline').message).toBe(OFFLINE_MESSAGE)
  })

  it('pide volver a entrar cuando la sesión venció', () => {
    expect(makeError('session-expired').message).toBe(SESSION_EXPIRED_MESSAGE)
  })

  it('avisa que la respuesta no se pudo interpretar', () => {
    expect(makeError('invalid-response').message).toBe(INVALID_RESPONSE_MESSAGE)
  })

  it('conserva tal cual el mensaje del servidor en un error 5xx', () => {
    expect(makeError('server-error', 'GitHub no disponible').message).toBe('GitHub no disponible')
  })

  it('recorta los espacios del mensaje del servidor', () => {
    expect(makeError('server-error', '  GitHub no disponible  ').message).toBe(
      'GitHub no disponible',
    )
  })

  it('cae al texto de servidor caído cuando el 5xx no trae mensaje propio', () => {
    expect(makeError('server-error').message).toBe(SERVER_ERROR_MESSAGE)
    expect(makeError('server-error', '   ').message).toBe(SERVER_ERROR_MESSAGE)
  })

  it('usa el mensaje del servidor en un 4xx que la API explicó', () => {
    expect(makeError('api-error', 'Payload inválido.').message).toBe('Payload inválido.')
  })

  it('cae al mensaje del flujo cuando el 4xx no trae mensaje propio', () => {
    expect(makeError('api-error').message).toBe(FALLBACK_MESSAGE)
  })

  it('se comporta como un Error normal', () => {
    const error = makeError('offline')

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ApiClientError')
    expect(error.category).toBe('offline')
    expect(error.endpoint).toBe('/api/stockevents')
    expect(error.status).toBe(400)
  })
})

describe('categoryForStatus', () => {
  it.each([
    [401, 'session-expired'],
    [400, 'api-error'],
    [500, 'server-error'],
    [503, 'server-error'],
  ] as const)('clasifica el estado %i como %s', (status, expected) => {
    expect(categoryForStatus(status)).toBe(expected)
  })
})

describe('apiEndpointPath', () => {
  it('conserva la ruta y descarta la query', () => {
    expect(apiEndpointPath('/api/market/quotes?symbols=AAPL&limit=5')).toBe('/api/market/quotes')
  })

  it('conserva la ruta y descarta el hash', () => {
    expect(apiEndpointPath('/api/sync#top')).toBe('/api/sync')
  })

  it('devuelve la ruta intacta cuando no hay query ni hash', () => {
    expect(apiEndpointPath('/api/stockevents')).toBe('/api/stockevents')
  })
})

describe('shouldReportApiError', () => {
  it('deja fuera solo los errores que la API ya explicó', () => {
    expect(shouldReportApiError(makeError('api-error', 'Payload inválido.'))).toBe(false)
    expect(shouldReportApiError(makeError('offline'))).toBe(true)
    expect(shouldReportApiError(makeError('session-expired'))).toBe(true)
    expect(shouldReportApiError(makeError('invalid-response'))).toBe(true)
    expect(shouldReportApiError(makeError('server-error'))).toBe(true)
  })
})
