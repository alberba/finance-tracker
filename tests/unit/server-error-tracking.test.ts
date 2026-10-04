import { beforeEach, describe, expect, it, vi } from 'vitest'

// Se mockea el SDK para que el real nunca se cargue: lo que se fija acá es el
// contrato de privacidad de lo que sale hacia Sentry.
const sentry = vi.hoisted(() => ({ captureException: vi.fn(), withScope: vi.fn() }))

vi.mock('@sentry/cloudflare', () => sentry)

import { reportApiRouteFailure } from '../../src/lib/server/error-tracking'

type ScopeHandler = (scope: { setTag: ReturnType<typeof vi.fn> }) => void

const setTag = vi.fn()

beforeEach(() => {
  sentry.withScope.mockImplementation((handler: ScopeHandler) => {
    // El scope expone solo setTag: cualquier otro adjunto reventaría el test en
    // vez de viajar a Sentry con datos financieros.
    handler({ setTag })
  })
})

function routeError(): Error {
  return new Error('fallo inesperado en la ruta')
}

describe('reportApiRouteFailure', () => {
  it('manda la ruta y el estado del endpoint, en ese orden y como texto', () => {
    const error = routeError()

    reportApiRouteFailure(error, { route: '/api/issues/report', status: 500 })

    expect(setTag.mock.calls).toEqual([
      ['api.route', '/api/issues/report'],
      ['http.response.status_code', '500'],
    ])
  })

  it('reporta exactamente el error recibido, una sola vez', () => {
    const error = routeError()

    reportApiRouteFailure(error, { route: '/api/sync', status: 500 })

    expect(sentry.captureException).toHaveBeenCalledTimes(1)
    expect(sentry.captureException).toHaveBeenCalledWith(error)
  })

  it('captura el objeto de error original, así su stack sobrevive al reporte', () => {
    const error = routeError()

    reportApiRouteFailure(error, { route: '/api/sync', status: 500 })

    // Es el precio documentado en el contrato: viaja el error entero (tipo,
    // mensaje y stack) para que un fallo de servidor sea diagnosticable.
    const captured = sentry.captureException.mock.calls[0]?.[0]
    expect(captured).toBe(error)
    expect(captured?.stack).toBe(error.stack)
    expect(captured?.stack).toContain('routeError')
  })

  it('no usa ningún otro punto de entrada del SDK', () => {
    reportApiRouteFailure(routeError(), { route: '/api/state', status: 500 })

    expect(Object.keys(sentry)).toEqual(['captureException', 'withScope'])
    expect(sentry.withScope).toHaveBeenCalledTimes(1)
  })

  it('no relanza si el SDK falla al reportar, y deja el fallo en el log', () => {
    // El reporte es best-effort: la respuesta HTTP que el wrap está por
    // devolver no puede caerse porque la telemetría falló.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    sentry.withScope.mockImplementation(() => {
      throw new Error('el SDK de Sentry falló')
    })

    expect(() => {
      reportApiRouteFailure(routeError(), { route: '/api/issues/report', status: 500 })
    }).not.toThrow()

    expect(sentry.captureException).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError.mock.calls[0]?.[0]).toContain('/api/issues/report')
  })
})
