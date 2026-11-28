import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'

const history = vi.hoisted(() => ({ loadInstrumentCloses: vi.fn() }))
const errorTracking = vi.hoisted(() => ({ reportApiRouteFailure: vi.fn() }))

vi.mock('../../src/lib/server/benchmark-history', () => history)
vi.mock('../../src/lib/server/error-tracking', () => errorTracking)

import { GET } from '../../src/pages/api/market/closes'

const PRINCIPAL = {
  userId: 'user-1',
  email: 'quien@example.com',
  provider: 'better-auth',
  subject: 'sub-1',
}

function call(query: string, locals: object = { principal: PRINCIPAL }) {
  return GET({
    url: new URL(`https://app.example.com/api/market/closes${query}`),
    locals,
  } as unknown as Parameters<typeof GET>[0]) as Promise<Response>
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/market/closes', () => {
  it('devuelve los cierres mensuales del instrumento con caché privada de una hora', async () => {
    history.loadInstrumentCloses.mockReturnValue(Effect.succeed([100, 101.5]))

    const response = await call('?symbol=ETH&type=crypto&currency=EUR&year=2026')

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600')
    await expect(response.json()).resolves.toEqual({ closes: [100, 101.5] })
    expect(history.loadInstrumentCloses).toHaveBeenCalledWith(
      { symbol: 'ETH', quoteSymbol: undefined, type: 'crypto', currency: 'EUR' },
      2026,
    )
  })

  it('rechaza sin sesión con 401', async () => {
    const response = await call('?symbol=ETH&type=crypto&year=2026', {})

    expect(response.status).toBe(401)
    expect(history.loadInstrumentCloses).not.toHaveBeenCalled()
  })

  it.each([
    ['sin símbolo', '?type=crypto&year=2026'],
    ['tipo desconocido', '?symbol=ETH&type=bono&year=2026'],
    ['año decimal', '?symbol=ETH&type=crypto&year=2026.5'],
  ])('responde 400 con %s', async (_name, query) => {
    const response = await call(query)

    expect(response.status).toBe(400)
    expect(history.loadInstrumentCloses).not.toHaveBeenCalled()
  })

  it('responde 502 con el símbolo si la consulta falla', async () => {
    history.loadInstrumentCloses.mockReturnValue(Effect.fail(new Error('Yahoo caído')))

    const response = await call('?symbol=ETH&type=crypto&year=2026')

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: 'No se pudo consultar ETH' })
  })
})
