import { beforeEach, describe, expect, it, vi } from 'vitest'

// Se mockea el módulo de tracking para que el SDK real de Sentry no se importe:
// acá solo se comprueba cuándo y con qué se reporta.
const errorTracking = vi.hoisted(() => ({ reportApiRouteFailure: vi.fn() }))

vi.mock('../../src/lib/server/error-tracking', () => errorTracking)

import {
  ForbiddenError,
  UnauthorizedError,
  withApiErrorHandling,
} from '../../src/lib/server/api-auth'

const ROUTE = '/api/issues/report'

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('withApiErrorHandling', () => {
  it('convierte un error inesperado en 500 con el cuerpo y las cabeceras de siempre', async () => {
    const response = await withApiErrorHandling(ROUTE, async () => {
      throw new Error('explosión en el handler')
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Error interno del servidor.' })
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('reporta el error inesperado una sola vez, con la ruta y el estado', async () => {
    const error = new Error('explosión en el handler')

    await withApiErrorHandling(ROUTE, async () => {
      throw error
    })

    expect(errorTracking.reportApiRouteFailure).toHaveBeenCalledTimes(1)
    expect(errorTracking.reportApiRouteFailure).toHaveBeenCalledWith(error, {
      route: ROUTE,
      status: 500,
    })
  })

  it('deja el error inesperado en el log con la ruta en el mensaje', async () => {
    const error = new Error('explosión en el handler')

    await withApiErrorHandling(ROUTE, async () => {
      throw error
    })

    expect(consoleError).toHaveBeenCalledWith(`[api] Unhandled route error in ${ROUTE}`, error)
  })

  it('responde 401 con el mensaje del error y no reporta nada', async () => {
    const response = await withApiErrorHandling(ROUTE, async () => {
      throw new UnauthorizedError('Se requiere autenticación.')
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Se requiere autenticación.' })
    expect(errorTracking.reportApiRouteFailure).not.toHaveBeenCalled()
  })

  it('responde 403 con el mensaje del error y no reporta nada', async () => {
    const response = await withApiErrorHandling(ROUTE, async () => {
      throw new ForbiddenError('El estado legacy solo está disponible para su propietario.')
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'El estado legacy solo está disponible para su propietario.',
    })
    expect(errorTracking.reportApiRouteFailure).not.toHaveBeenCalled()
  })

  it('devuelve la respuesta del handler tal cual y no reporta nada', async () => {
    const expected = new Response('ok', { status: 200 })

    const response = await withApiErrorHandling(ROUTE, async () => expected)

    expect(response).toBe(expected)
    expect(errorTracking.reportApiRouteFailure).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })
})
