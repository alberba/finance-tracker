import { afterEach, describe, expect, it, vi } from 'vitest'

import { yahooFinance, YahooFinanceHttpError } from '../../src/lib/server/yahoo-finance'

describe('transporte de yahoo-finance2', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('permite las redirecciones del SDK para obtener la sesión antes de cotizar', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: {
            Location: 'https://finance.yahoo.com/quote/AAPL/',
            'Set-Cookie': 'A1=test; Domain=.yahoo.com; Path=/; Max-Age=3600',
          },
        }),
      )
      .mockResolvedValueOnce(new Response('test-crumb'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            quoteResponse: { result: [], error: null },
          }),
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(yahooFinance.quote('NOT-FOUND')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/v7/finance/quote?'),
      expect.any(Object),
    )
  })

  it('conserva el estado HTTP y Retry-After para enfriar las peticiones', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '120' } }),
        ),
    )

    await expect(yahooFinance.search('limited')).rejects.toMatchObject({
      name: 'YahooFinanceHttpError',
      status: 429,
      retryAfterMs: 120_000,
    })
  })

  it('interpreta Retry-After como fecha HTTP', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('Unavailable', {
          status: 503,
          headers: { 'Retry-After': 'Sun, 18 Oct 2026 12:02:00 GMT' },
        }),
      ),
    )

    await expect(yahooFinance.search('unavailable')).rejects.toMatchObject({
      status: 503,
      retryAfterMs: 120_000,
    })
  })

  it('aborta una consulta bloqueada a los cinco segundos', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
              once: true,
            })
          }),
      ),
    )
    const pending = yahooFinance.search('timeout')
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(5_000)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it('distingue errores HTTP de un error de red', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network offline')))
    await expect(yahooFinance.search('offline')).rejects.not.toBeInstanceOf(YahooFinanceHttpError)
  })
})
