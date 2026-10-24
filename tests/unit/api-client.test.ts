import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ApiClientError,
  INVALID_RESPONSE_MESSAGE,
  OFFLINE_MESSAGE,
  SERVER_ERROR_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  apiEndpointPath,
} from '../../src/lib/client/api-error'
import {
  requestApiJson as requestApiJsonEffect,
  type ApiRequestInit,
} from '../../src/lib/client/api-client'
import { reportApiErrorToSentry } from '../../src/lib/client/error-reporting'
import { runClientHttp } from '../../src/lib/client/runtime'

/** El efecto se ejecuta en el borde, igual que hace un manejador de Vue. */
function requestApiJson<T>(endpoint: string, init: ApiRequestInit): Promise<T> {
  return runClientHttp(requestApiJsonEffect<T>(endpoint, init))
}

const sentry = vi.hoisted(() => ({ captureException: vi.fn(), withScope: vi.fn() }))

vi.mock('../../src/lib/client/error-reporting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/client/error-reporting')>()
  // Espía que delega en la implementación real: el embudo queda aislado, pero
  // el caso de telemetría caída ejerce la pieza de verdad.
  return { reportApiErrorToSentry: vi.fn(actual.reportApiErrorToSentry) }
})

// El SDK real nunca se carga; el caso de fallo lo hace reventar sin red.
vi.mock('@sentry/browser', () => sentry)

const reportMock = vi.mocked(reportApiErrorToSentry)
const FALLBACK_MESSAGE = 'No se pudieron cargar los eventos'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Cuerpo de una pantalla de borde (Cloudflare Access) o de un 502 HTML. */
function htmlResponse(status: number): Response {
  return new Response('<!doctype html><html><body>Access denied</body></html>', { status })
}

async function captureApiError(promise: Promise<unknown>): Promise<ApiClientError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ApiClientError) return error
    throw error
  }
  throw new Error('Se esperaba que la petición fallara con un ApiClientError')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestApiJson con respuesta correcta', () => {
  it('devuelve el cuerpo JSON interpretado y no reporta nada', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 7 }, 201))
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestApiJson<{ id: number }>('/api/stockevents', {
      method: 'POST',
      body: { name: 'ACME' },
      fallbackMessage: FALLBACK_MESSAGE,
    })

    expect(result).toEqual({ id: 7 })
    expect(reportMock).not.toHaveBeenCalled()
  })

  it('pide JSON y manda el cuerpo serializado cuando hay body', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 7 }, 201))
    vi.stubGlobal('fetch', fetchMock)

    await requestApiJson('/api/stockevents', {
      method: 'POST',
      body: { name: 'ACME' },
      fallbackMessage: FALLBACK_MESSAGE,
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/stockevents', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ACME' }),
    })
  })

  it('no declara Content-Type ni body en un GET', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await requestApiJson('/api/state', { fallbackMessage: FALLBACK_MESSAGE })

    const call = fetchMock.mock.calls[0]
    expect(call?.[0]).toBe('/api/state')
    expect(call?.[1]?.method).toBe('GET')
    expect(call?.[1]?.headers).toEqual({ Accept: 'application/json' })
    expect(call?.[1]?.body).toBeUndefined()
  })
})

describe('requestApiJson sin respuesta HTTP', () => {
  it('convierte un fetch rechazado en un error de conexión reportado', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureApiError(
      requestApiJson('/api/stockevents', { fallbackMessage: FALLBACK_MESSAGE }),
    )

    expect(error).toBeInstanceOf(ApiClientError)
    expect(error.category).toBe('offline')
    expect(error.message).toBe(OFFLINE_MESSAGE)
    expect(error.status).toBeUndefined()
    expect(reportMock).toHaveBeenCalledTimes(1)
    expect(reportMock).toHaveBeenCalledWith(error)
  })
})

describe('requestApiJson con cuerpo que no es JSON', () => {
  it('lo trata como respuesta inválida y reporta una sola vez', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<!doctype html>', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureApiError(
      requestApiJson('/api/state', { fallbackMessage: FALLBACK_MESSAGE }),
    )

    expect(error.category).toBe('invalid-response')
    expect(error.message).toBe(INVALID_RESPONSE_MESSAGE)
    expect(error.status).toBe(200)
    expect(reportMock).toHaveBeenCalledTimes(1)
  })

  it('un 401 con cuerpo HTML sigue siendo sesión vencida, no respuesta inválida', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(401)))

    const error = await captureApiError(
      requestApiJson('/api/stockevents', { fallbackMessage: FALLBACK_MESSAGE }),
    )

    expect(error.category).toBe('session-expired')
    expect(error.message).toBe(SESSION_EXPIRED_MESSAGE)
    expect(error.status).toBe(401)
    expect(reportMock).toHaveBeenCalledTimes(1)
  })

  it('un 503 con cuerpo HTML usa el texto por defecto del servidor caído', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(503)))

    const error = await captureApiError(
      requestApiJson('/api/stockevents/sync', { fallbackMessage: FALLBACK_MESSAGE }),
    )

    expect(error.category).toBe('server-error')
    expect(error.message).toBe(SERVER_ERROR_MESSAGE)
    expect(error.status).toBe(503)
    expect(reportMock).toHaveBeenCalledTimes(1)
  })

  it('un 400 con cuerpo HTML cae al mensaje del flujo y queda fuera de Sentry', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(htmlResponse(400)))

    const error = await captureApiError(
      requestApiJson('/api/stockevents', { fallbackMessage: FALLBACK_MESSAGE }),
    )

    expect(error.category).toBe('api-error')
    expect(error.message).toBe(FALLBACK_MESSAGE)
    expect(error.status).toBe(400)
    expect(reportMock).not.toHaveBeenCalled()
  })
})

describe('requestApiJson con respuesta de error', () => {
  it('trata el 401 como sesión vencida sin filtrar el texto del servidor', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: 'Token caducado.' }, 401))
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureApiError(
      requestApiJson('/api/stockevents', { fallbackMessage: FALLBACK_MESSAGE }),
    )

    expect(error.category).toBe('session-expired')
    expect(error.message).toBe(SESSION_EXPIRED_MESSAGE)
    expect(error.message).not.toBe('Token caducado.')
    expect(error.status).toBe(401)
    expect(reportMock).toHaveBeenCalledTimes(1)
  })

  it('conserva el mensaje del servidor en un 5xx', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: 'GitHub no disponible' }, 500))
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureApiError(
      requestApiJson('/api/stockevents/sync', { fallbackMessage: FALLBACK_MESSAGE }),
    )

    expect(error.category).toBe('server-error')
    expect(error.message).toBe('GitHub no disponible')
    expect(error.status).toBe(500)
    expect(reportMock).toHaveBeenCalledTimes(1)
  })

  it('deja fuera de Sentry un 4xx que la API ya explicó', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: 'Payload inválido.' }, 400))
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureApiError(
      requestApiJson('/api/stockevents', { fallbackMessage: FALLBACK_MESSAGE }),
    )

    expect(error.category).toBe('api-error')
    expect(error.message).toBe('Payload inválido.')
    expect(reportMock).not.toHaveBeenCalled()
  })

  it('usa el mensaje del flujo cuando el 4xx no explica nada', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: false }, 400))
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureApiError(
      requestApiJson('/api/stockevents', { fallbackMessage: FALLBACK_MESSAGE }),
    )

    expect(error.category).toBe('api-error')
    expect(error.message).toBe(FALLBACK_MESSAGE)
  })
})

describe('privacidad del endpoint reportado', () => {
  it('entrega al reporter un error del que se deriva la ruta sin query ni hash', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureApiError(
      requestApiJson('/api/market/quotes?symbols=AAPL&limit=5#top', {
        fallbackMessage: FALLBACK_MESSAGE,
      }),
    )

    expect(reportMock).toHaveBeenCalledTimes(1)
    const reported = reportMock.mock.calls[0]?.[0]
    expect(reported).toBe(error)
    expect(apiEndpointPath(reported?.endpoint ?? '')).toBe('/api/market/quotes')
  })
})

describe('requestApiJson con la telemetría caída', () => {
  it('rechaza igual con el error clasificado, sin que la telemetría lo reemplace', async () => {
    // El SDK revienta dentro del reporter real: el embudo no puede perder el
    // error que ya clasificó.
    sentry.withScope.mockImplementation(() => {
      throw new Error('Sentry no disponible')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureApiError(
      requestApiJson('/api/stockevents', { fallbackMessage: FALLBACK_MESSAGE }),
    )

    expect(error).toBeInstanceOf(ApiClientError)
    expect(error.category).toBe('offline')
    expect(error.message).toBe(OFFLINE_MESSAGE)
    expect(error.status).toBeUndefined()
    expect(reportMock).toHaveBeenCalledTimes(1)
    expect(sentry.captureException).not.toHaveBeenCalled()
  })
})
