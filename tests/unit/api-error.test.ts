import { describe, expect, it } from 'vitest'

import {
  ApiClientError,
  SERVER_ERROR_MESSAGE,
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
  it('recorta los espacios del mensaje del servidor', () => {
    expect(makeError('server-error', '  GitHub no disponible  ').message).toBe(
      'GitHub no disponible',
    )
  })

  it('cae al texto de servidor caído cuando el 5xx no trae mensaje propio', () => {
    expect(makeError('server-error').message).toBe(SERVER_ERROR_MESSAGE)
    expect(makeError('server-error', '   ').message).toBe(SERVER_ERROR_MESSAGE)
  })
})

describe('categoryForStatus', () => {
  it.each([
    [401, 'session-expired'],
    [400, 'api-error'],
    [500, 'server-error'],
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
