import { afterEach, describe, expect, it, vi } from 'vitest'
import fixture from './fixtures/bitvavo-real-sanitized.json'
import { Effect } from 'effect'
import {
  fetchBitvavoHistory,
  InvalidCredential,
  localDateTime,
} from '../../src/lib/server/bitvavo/client'
import { Http } from '../../src/lib/server/http'

const history = (
  credentials: { apiKey: string; apiSecret: string },
  range: { from: number; to: number; timeZone: string; startDate?: string },
  request: typeof fetch,
) =>
  Effect.runPromise(
    Effect.provideService(fetchBitvavoHistory(credentials, range), Http, { request }),
  )

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
    const result = await history(credentials, range, http)
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
    await expect(history(credentials, range, http)).rejects.toBeInstanceOf(InvalidCredential)
    expect(http).toHaveBeenCalledTimes(1)
  })

  it('asks for manual redirects, which workerd supports, and refuses to follow one', async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { Location: 'https://example.com' } }),
      )
    await expect(history(credentials, range, http)).rejects.toThrow('redirigió')
    expect(http).toHaveBeenCalledTimes(1)
    expect(http.mock.calls[0][1]?.redirect).toBe('manual')
  })

  it('honors Retry-After before retrying a rate-limited page', async () => {
    vi.useFakeTimers()
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(
        Response.json({ items: fixture.transactions, currentPage: 1, totalPages: 1 }),
      )
    const result = history(credentials, range, http)
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
    const result = await history(credentials, range, http)
    expect(result.incompatible).toEqual([
      { externalId: operation.transactionId, executedAt: operation.executedAt, reason },
    ])
  })

  it('rejects repeated external identities rather than silently closing an incomplete preview', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        items: [fixture.transactions[0], fixture.transactions[0]],
        currentPage: 1,
        totalPages: 1,
      }),
    )
    await expect(history(credentials, range, http)).rejects.toThrow('repetidas')
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
    expect((await history(credentials, localRange, http)).incompatible).toEqual([])
  })
})

describe('local date and time of a remote instant', () => {
  it.each([
    // Midnight edge: still the previous day in New York, already the next in Madrid.
    ['2024-01-01T04:30:00.000Z', 'America/New_York', '2023-12-31', '23:30:00'],
    ['2023-12-31T23:30:00.000Z', 'Europe/Madrid', '2024-01-01', '00:30:00'],
    // Spring forward in Madrid: 02:00 local does not exist, 01:00Z is 03:00 CEST.
    ['2024-03-31T00:59:59.000Z', 'Europe/Madrid', '2024-03-31', '01:59:59'],
    ['2024-03-31T01:00:00.000Z', 'Europe/Madrid', '2024-03-31', '03:00:00'],
    // Fall back: the same local hour happens twice, each from its own instant.
    ['2024-10-27T00:30:00.000Z', 'Europe/Madrid', '2024-10-27', '02:30:00'],
    ['2024-10-27T01:30:00.000Z', 'Europe/Madrid', '2024-10-27', '02:30:00'],
  ])('%s in %s is %s %s', (instant, zone, date, time) => {
    expect(localDateTime(Date.parse(instant), zone)).toEqual({ date, time })
  })
})
