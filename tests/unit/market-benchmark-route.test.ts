import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'

const history = vi.hoisted(() => ({ loadBenchmarkCloses: vi.fn() }))
const errorTracking = vi.hoisted(() => ({ reportApiRouteFailure: vi.fn() }))

vi.mock('../../src/lib/server/benchmark-history', () => history)
vi.mock('../../src/lib/server/error-tracking', () => errorTracking)

import { GET } from '../../src/pages/api/market/benchmark'

const PRINCIPAL = {
  userId: 'user-1',
  email: 'quien@example.com',
  provider: 'better-auth',
  subject: 'sub-1',
}

function call(query: string, locals: object = { principal: PRINCIPAL }) {
  return GET({
    url: new URL(`https://app.example.com/api/market/benchmark${query}`),
    locals,
  } as unknown as Parameters<typeof GET>[0]) as Promise<Response>
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/market/benchmark', () => {
  it('devuelve los cierres del índice con caché privada de una hora', async () => {
    history.loadBenchmarkCloses.mockReturnValue(Effect.succeed([100, 101.5]))

    const response = await call('?id=sp-500&year=2026')

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600')
    await expect(response.json()).resolves.toEqual({ closes: [100, 101.5] })
    expect(history.loadBenchmarkCloses).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sp-500', symbol: 'SXR8.DE' }),
      2026,
    )
  })

  it('rechaza sin sesión con 401', async () => {
    const response = await call('?id=sp-500&year=2026', {})

    expect(response.status).toBe(401)
    expect(history.loadBenchmarkCloses).not.toHaveBeenCalled()
  })

  it.each([
    ['índice desconocido', '?id=nope&year=2026'],
    ['sin año', '?id=sp-500'],
    ['año decimal', '?id=sp-500&year=2026.5'],
    ['año demasiado antiguo', '?id=sp-500&year=1989'],
  ])('responde 400 con %s', async (_name, query) => {
    const response = await call(query)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Índice o año no válido' })
    expect(history.loadBenchmarkCloses).not.toHaveBeenCalled()
  })

  it('acepta los límites del rango de años', async () => {
    history.loadBenchmarkCloses.mockReturnValue(Effect.succeed([]))

    expect((await call('?id=sp-500&year=1990')).status).toBe(200)
    expect((await call('?id=sp-500&year=2100')).status).toBe(200)
  })

  it('responde 502 con el nombre del índice si la consulta falla', async () => {
    history.loadBenchmarkCloses.mockReturnValue(Effect.fail(new Error('Yahoo caído')))

    const response = await call('?id=ibex-35&year=2026')

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: 'No se pudo consultar IBEX 35' })
  })
})
