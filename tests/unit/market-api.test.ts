import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'

const demo = vi.hoisted(() => ({ isDemoMode: vi.fn(() => false) }))
vi.mock('../../src/scripts/demo-mode', () => demo)

import { ApiClientError } from '../../src/lib/client/api-error'
import { ClientHttp } from '../../src/lib/client/http'
import { fetchBenchmarkCloses, fetchMarketQuotes } from '../../src/services/market-api'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const run = <A>(
  effect: Effect.Effect<A, ApiClientError, ClientHttp>,
  request: typeof fetch,
): Promise<A> => Effect.runPromise(Effect.provideService(effect, ClientHttp, { request }))

beforeEach(() => {
  demo.isDemoMode.mockReturnValue(false)
})

describe('fetchBenchmarkCloses', () => {
  it('pide los cierres del índice y el año a la API', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ closes: [1, 2, 3] }))

    await expect(run(fetchBenchmarkCloses('msci-world', 2026), request)).resolves.toEqual([1, 2, 3])

    expect(request).toHaveBeenCalledWith(
      '/api/market/benchmark?id=msci-world&year=2026',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('devuelve vacío si la respuesta no trae cierres', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}))

    await expect(run(fetchBenchmarkCloses('sp-500', 2026), request)).resolves.toEqual([])
  })

  it('no consulta la red en modo demo', async () => {
    demo.isDemoMode.mockReturnValue(true)
    const request = vi.fn<typeof fetch>()

    await expect(run(fetchBenchmarkCloses('sp-500', 2026), request)).resolves.toEqual([])
    expect(request).not.toHaveBeenCalled()
  })

  it('falla con ApiClientError si la API responde con error', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: 'No se pudo consultar IBEX 35' }, 502))

    const error = await Effect.runPromise(
      Effect.flip(
        Effect.provideService(fetchBenchmarkCloses('ibex-35', 2026), ClientHttp, { request }),
      ),
    )
    expect(error).toBeInstanceOf(ApiClientError)
  })
})

describe('fetchMarketQuotes', () => {
  const instruments = [{ id: 'fund' }] as never
  const fallback = { fund: { price: 12 } } as never

  it('no pide nada sin instrumentos', async () => {
    const request = vi.fn<typeof fetch>()

    await expect(run(fetchMarketQuotes([], fallback), request)).resolves.toEqual({})
    expect(request).not.toHaveBeenCalled()
  })

  it('manda instrumentos y cotizaciones de reserva y devuelve las cotizaciones', async () => {
    const quotes = { fund: { price: 13 } }
    const request = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ quotes }))

    await expect(run(fetchMarketQuotes(instruments, fallback), request)).resolves.toEqual(quotes)

    const [url, init] = request.mock.calls[0]
    expect(url).toBe('/api/market/quotes')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ instruments, fallbackQuotes: fallback })
  })

  it('devuelve vacío si la respuesta no trae cotizaciones', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}))

    await expect(run(fetchMarketQuotes(instruments, fallback), request)).resolves.toEqual({})
  })

  it('usa las cotizaciones de reserva en modo demo', async () => {
    demo.isDemoMode.mockReturnValue(true)
    const request = vi.fn<typeof fetch>()

    await expect(run(fetchMarketQuotes(instruments, fallback), request)).resolves.toBe(fallback)
    expect(request).not.toHaveBeenCalled()
  })
})
