import { afterEach, describe, expect, it, vi } from 'vitest'
import fixture from './fixtures/bitvavo-real-sanitized.json'
import { fetchBitvavoHistory, InvalidCredential } from '../../src/lib/server/bitvavo/client'

const credentials = { apiKey: 'test-key', apiSecret: 'test-secret' }
const range = { from: 0, to: 1700000000000, timeZone: 'Europe/Madrid' }
afterEach(() => vi.useRealTimers())

describe('Bitvavo account history', () => {
  it('preserves exact purchase and sale amounts and local execution time', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        items: fixture.transactions,
        currentPage: 1,
        totalPages: 1,
      }),
    )
    const result = await fetchBitvavoHistory(credentials, range, http)
    expect(result.operations[0]).toMatchObject({
      externalId: 'example-1',
      quantity: '0.00008878285',
      unitPrice: '76953',
      fee: '0.01789334395',
      cashAmount: '6.85',
      date: '2020-01-01',
      time: '01:00:00',
    })
    expect(result.operations[1]).toMatchObject({ side: 'sell', cashAmount: '58.33186' })
    expect(result.incompatible).toEqual([])
  })

  it('rejects invalid credentials without exposing provider bodies or secrets', async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('test-secret', { status: 401 }))
    await expect(fetchBitvavoHistory(credentials, range, http)).rejects.toBeInstanceOf(
      InvalidCredential,
    )
    expect(http).toHaveBeenCalledTimes(1)
  })

  it('honors Retry-After before retrying a rate-limited page', async () => {
    vi.useFakeTimers()
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(
        Response.json({ items: fixture.transactions, currentPage: 1, totalPages: 1 }),
      )
    const result = fetchBitvavoHistory(credentials, range, http)
    await vi.waitFor(() => expect(http).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1900)
    expect(http).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    await vi.waitFor(() => expect(http).toHaveBeenCalledTimes(2))
    expect((await result).operations).toHaveLength(2)
    expect(http).toHaveBeenCalledTimes(2)
  })

  it.each([
    {
      name: 'non-EUR fees',
      index: 0,
      patch: { feesCurrency: 'BTC' },
      reason: 'Precio y comisión deben estar en EUR.',
    },
    {
      name: 'inconsistent gross flows',
      index: 1,
      patch: { receivedAmount: '100' },
      reason: 'La operación no cumple el contrato contable validado.',
    },
  ])('lists $name as incompatible', async ({ index, patch, reason }) => {
    const operation = { ...fixture.transactions[index], ...patch }
    const http = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        items: [operation],
        currentPage: 1,
        totalPages: 1,
      }),
    )
    const result = await fetchBitvavoHistory(credentials, range, http)
    expect(result.incompatible).toEqual([{ externalId: operation.transactionId, reason }])
  })

  it('rejects repeated external identities rather than silently closing an incomplete preview', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        items: [fixture.transactions[0], fixture.transactions[0]],
        currentPage: 1,
        totalPages: 1,
      }),
    )
    await expect(fetchBitvavoHistory(credentials, range, http)).rejects.toThrow('repetidas')
  })

  it('excludes incompatible operations before the configured local start date', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        items: [{ ...fixture.transactions[0], feesCurrency: 'BTC' }],
        currentPage: 1,
        totalPages: 1,
      }),
    )
    const localRange = { ...range, startDate: '2020-01-02' }
    expect((await fetchBitvavoHistory(credentials, localRange, http)).incompatible).toEqual([])
  })
})
