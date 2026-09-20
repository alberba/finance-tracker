import { beforeEach, describe, expect, it, vi } from 'vitest'

// Se mockea el SDK para que el real nunca se cargue: lo que se fija acá es el
// contrato de privacidad de lo que sale hacia Sentry.
const sentry = vi.hoisted(() => ({ captureException: vi.fn(), withScope: vi.fn() }))

vi.mock('@sentry/browser', () => sentry)

import { ApiClientError, apiErrorTitle } from '../../src/lib/client/api-error'
import { reportApiErrorToSentry } from '../../src/lib/client/error-reporting'

type ScopeHandler = (scope: { setTag: ReturnType<typeof vi.fn> }) => void

const setTag = vi.fn()

beforeEach(() => {
  sentry.withScope.mockImplementation((handler: ScopeHandler) => {
    // El scope expone solo setTag: cualquier otro adjunto reventaría el test en
    // vez de viajar a Sentry con datos de la persona.
    handler({ setTag })
  })
})

function serverError(): ApiClientError {
  return new ApiClientError('server-error', {
    endpoint: '/api/stockevents/sync?symbol=AAPL#top',
    status: 503,
    fallbackMessage: 'No se pudo sincronizar',
  })
}

/** El texto que un 5xx del proveedor deja en `message`, y que NO debe viajar. */
const PROVIDER_TEXT = 'Stock Events respondió: {"error":"invalid api key"}'

function serverErrorWithProviderText(): ApiClientError {
  return new ApiClientError('server-error', {
    endpoint: '/api/stockevents/sync?symbol=AAPL#top',
    status: 503,
    serverMessage: PROVIDER_TEXT,
    fallbackMessage: 'No se pudo sincronizar',
  })
}

function capturedError(): Error {
  const captured = sentry.captureException.mock.calls[0]?.[0]
  if (!(captured instanceof Error)) throw new Error('Sentry no capturó un Error')
  return captured
}

describe('reportApiErrorToSentry', () => {
  it('manda solo la ruta sin query, la categoría y el estado, en ese orden', () => {
    const error = serverError()

    reportApiErrorToSentry(error)

    expect(setTag.mock.calls).toEqual([
      ['api.endpoint', '/api/stockevents/sync'],
      ['api.category', 'server-error'],
      ['api.status', '503'],
    ])
    expect(sentry.captureException).toHaveBeenCalledTimes(1)
    expect(capturedError().message).toBe(apiErrorTitle(error))
  })

  it('captura un resumen propio y nunca el mensaje que trajo la API', () => {
    const error = serverErrorWithProviderText()

    reportApiErrorToSentry(error)

    const captured = capturedError()
    expect(captured.message).toBe('Fallo de API [server-error] en /api/stockevents/sync (503)')
    expect(error.message).toBe(PROVIDER_TEXT)
    expect(captured.message).not.toContain('invalid api key')
    expect(captured.message).not.toContain('Stock Events respondió')
  })

  it('omite el tag de estado cuando el error no trae status', () => {
    const error = new ApiClientError('offline', {
      endpoint: '/api/state',
      fallbackMessage: 'No hay conexión',
    })

    reportApiErrorToSentry(error)

    expect(setTag.mock.calls).toEqual([
      ['api.endpoint', '/api/state'],
      ['api.category', 'offline'],
    ])
    expect(capturedError().message).toBe('Fallo de API [offline] en /api/state (sin respuesta)')
  })

  it('no usa ningún otro punto de entrada del SDK', () => {
    reportApiErrorToSentry(serverError())

    expect(Object.keys(sentry)).toEqual(['captureException', 'withScope'])
    expect(sentry.withScope).toHaveBeenCalledTimes(1)
  })

  it('un SDK caído no rompe el camino del error ya clasificado', () => {
    sentry.withScope.mockImplementation(() => {
      throw new Error('Sentry no disponible')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // El reporte es best-effort: el error tipado no puede quedar reemplazado
    // por un fallo de telemetría.
    expect(() => reportApiErrorToSentry(serverError())).not.toThrow()
    expect(sentry.captureException).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
