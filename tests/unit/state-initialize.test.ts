import { afterEach, describe, expect, it, vi } from 'vitest'

import { resetState } from '../../src/lib/client/state-initialize'

function mockFetchOnce(response: { status: number; body: unknown }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: () => Promise.resolve(response.body),
    }),
  )
}

describe("resetState ('empezar de cero')", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns ok:true after resetting the authenticated user's space", async () => {
    mockFetchOnce({ status: 200, body: { ok: true } })

    const result = await resetState()

    expect(result).toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledWith(
      '/api/state/reset',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('surfaces a 401 as ok:false with the server error message', async () => {
    mockFetchOnce({ status: 401, body: { error: 'Se requiere autenticación.' } })

    const result = await resetState()

    expect(result).toEqual({ ok: false, error: 'Se requiere autenticación.' })
  })

  it('returns ok:false when fetch itself rejects (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const result = await resetState()

    expect(result).toEqual({ ok: false, error: 'network down' })
  })
})
