import { beforeEach, describe, expect, it, vi } from 'vitest'

// Se mockea el SDK para que el real nunca se cargue: lo que se fija acá es el
// contrato de privacidad de lo que sale hacia Sentry.
const sentry = vi.hoisted(() => ({ captureException: vi.fn(), withScope: vi.fn() }))

vi.mock('@sentry/browser', () => sentry)

import { ApiClientError } from '../../src/lib/client/api-error'
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
    expect(sentry.captureException).toHaveBeenCalledWith(error)
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
  })

  it('no usa ningún otro punto de entrada del SDK', () => {
    reportApiErrorToSentry(serverError())

    expect(Object.keys(sentry)).toEqual(['captureException', 'withScope'])
    expect(sentry.withScope).toHaveBeenCalledTimes(1)
  })
})
