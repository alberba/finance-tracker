import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/scripts/demo-mode', () => ({
  isDemoMode: vi.fn(() => false),
}))

import type { StockEventsTransactionPayload } from '../../src/domain/stockevents/transaction-payload'
import { ApiClientError } from '../../src/lib/client/api-error'
import { runClientHttp } from '../../src/lib/client/runtime'
import * as stockeventsApi from '../../src/services/stockevents-api'

// Los efectos se ejecutan en el borde, igual que hace la acción de Pinia.
const saveStockEventsCredential = (apiKey: string) =>
  runClientHttp(stockeventsApi.saveStockEventsCredential(apiKey))
const fetchStockEventsWatchlists = () => runClientHttp(stockeventsApi.fetchStockEventsWatchlists())
const createStockEventsTransaction = (
  transaction: Parameters<typeof stockeventsApi.createStockEventsTransaction>[0],
) => runClientHttp(stockeventsApi.createStockEventsTransaction(transaction))

const transaction: StockEventsTransactionPayload = {
  watchlistId: 'wl-1',
  symbol: 'ACME',
  date: '2026-08-23',
  change: 3,
  price: 12.5,
  priceCurrency: 'EUR',
  type: 'buy',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('guardar la credencial de Stock Events', () => {
  it('con una clave no vacía hace PUT y manda el cuerpo normalizado', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ configured: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(saveStockEventsCredential('  clave-secreta  ')).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/integrations/stockevents', {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'clave-secreta' }),
    })
  })

  it('con una clave vacía hace DELETE sin cuerpo ni Content-Type', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ configured: false }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(saveStockEventsCredential('   ')).resolves.toBe(false)

    const call = fetchMock.mock.calls[0]
    expect(call?.[0]).toBe('/api/integrations/stockevents')
    expect(call?.[1]?.method).toBe('DELETE')
    expect(call?.[1]?.headers).toEqual({ Accept: 'application/json' })
    expect(call?.[1]?.body).toBeUndefined()
  })
})

describe('cargar las listas de Stock Events', () => {
  it('devuelve un arreglo vacío cuando el servidor no manda listas', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({})))

    await expect(fetchStockEventsWatchlists()).resolves.toEqual([])
  })
})

describe('crear una transacción en Stock Events', () => {
  it('postea la transacción y devuelve la creada', async () => {
    const created = { id: 'tx-1', watchlistId: 'wl-1', symbol: 'ACME' }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ transaction: created }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createStockEventsTransaction(transaction)).resolves.toEqual(created)
    expect(fetchMock).toHaveBeenCalledWith('/api/stockevents/transactions', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction }),
    })
  })

  it('un 2xx sin transacción es un contrato roto, no un undefined silencioso', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true })))

    const error = await captureApiError(createStockEventsTransaction(transaction))

    expect(error.category).toBe('invalid-response')
    expect(error.endpoint).toBe('/api/stockevents/transactions')
  })
})
