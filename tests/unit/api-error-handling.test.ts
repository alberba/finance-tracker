import { beforeEach, describe, expect, it, vi } from 'vitest'

// Sentry es el límite externo: un SDK falso recoge lo que se reportaría. El módulo de
// tracking y `withApiErrorHandling` son los reales.
const sentry = vi.hoisted(() => {
  const reported: Array<{ error: unknown; tags: Record<string, string> }> = []
  let tags: Record<string, string> = {}
  return {
    reported,
    sdk: {
      withScope: (handler: (scope: { setTag: (key: string, value: string) => void }) => void) => {
        tags = {}
        handler({ setTag: (key, value) => (tags[key] = value) })
      },
      captureException: (error: unknown) => {
        reported.push({ error, tags })
      },
    },
  }
})

vi.mock('@sentry/cloudflare', () => sentry.sdk)

import {
  ForbiddenError,
  UnauthorizedError,
  withApiErrorHandling,
} from '../../src/lib/server/api-auth'

const ROUTE = '/api/issues/report'

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  sentry.reported.length = 0
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

    expect(sentry.reported).toEqual([
      { error, tags: { 'api.route': ROUTE, 'http.response.status_code': '500' } },
    ])
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
    expect(sentry.reported).toEqual([])
  })

  it('responde 403 con el mensaje del error y no reporta nada', async () => {
    const response = await withApiErrorHandling(ROUTE, async () => {
      throw new ForbiddenError('No tienes permiso para realizar esta operación.')
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'No tienes permiso para realizar esta operación.',
    })
    expect(sentry.reported).toEqual([])
  })

  it('devuelve la respuesta del handler tal cual y no reporta nada', async () => {
    const expected = new Response('ok', { status: 200 })

    const response = await withApiErrorHandling(ROUTE, async () => expected)

    expect(response).toBe(expected)
    expect(sentry.reported).toEqual([])
    expect(consoleError).not.toHaveBeenCalled()
  })
})
