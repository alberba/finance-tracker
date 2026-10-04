import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/scripts/demo-mode', () => ({
  isDemoMode: vi.fn(() => false),
}))

import type { StockEventsTransactionPayload } from '../../src/domain/stockevents/transaction-payload'
import { ApiClientError, OFFLINE_MESSAGE } from '../../src/lib/client/api-error'
import {
  checkStockEventsSymbols,
  createStockEventsTransaction,
  fetchStockEventsCredentialStatus,
  fetchStockEventsWatchlists,
  saveStockEventsCredential,
} from '../../src/services/stockevents-api'

const transaction: StockEventsTransactionPayload = {
  watchlistId: 'wl-1',
  symbol: 'ACME',
  date: '2026-08-23',
  change: 3,
  price: 12.5,
  priceCurrency: 'EUR',
  type: 'buy',
}

const checks = [{ symbol: 'ACME', watchlistId: 'wl-1' }]

const flujos = [
  ['la credencial', () => fetchStockEventsCredentialStatus()],
  ['guardar la credencial', () => saveStockEventsCredential('clave-secreta')],
  ['las listas', () => fetchStockEventsWatchlists()],
  ['los símbolos', () => checkStockEventsSymbols(checks)],
  ['la transacción', () => createStockEventsTransaction(transaction)],
] as const

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

describe('consultar la credencial de Stock Events', () => {
  it('pide la ruta sin Content-Type y devuelve el flag configured', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ configured: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchStockEventsCredentialStatus()).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/integrations/stockevents', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
  })
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
  it('devuelve el arreglo de listas del servidor', async () => {
    const watchlists = [{ id: 'wl-1', name: 'Cartera', currency: 'EUR' }]
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ watchlists }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchStockEventsWatchlists()).resolves.toEqual(watchlists)
    expect(fetchMock).toHaveBeenCalledWith('/api/stockevents/watchlists', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
  })

  it('devuelve un arreglo vacío cuando el servidor no manda listas', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({})))

    await expect(fetchStockEventsWatchlists()).resolves.toEqual([])
  })
})

describe('comprobar símbolos en Stock Events', () => {
  it('postea las comprobaciones y devuelve los resultados', async () => {
    const results = [{ symbol: 'ACME', watchlistId: 'wl-1', status: 'in-watchlist' }]
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ results }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(checkStockEventsSymbols(checks)).resolves.toEqual(results)
    expect(fetchMock).toHaveBeenCalledWith('/api/stockevents/check-symbols', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ checks }),
    })
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

describe('flujos de Stock Events sin respuesta HTTP', () => {
  it.each(flujos)('con %s el fetch rechazado es un error de conexión', async (_nombre, flow) => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')),
    )

    const error = await captureApiError(flow())

    expect(error).toBeInstanceOf(ApiClientError)
    expect(error.category).toBe('offline')
    expect(error.message).toBe(OFFLINE_MESSAGE)
  })
})

describe('flujos de Stock Events con error del servidor', () => {
  it.each(flujos)('con %s el texto del servidor viaja sin cambios', async (_nombre, flow) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ error: 'Stock Events no responde' }, 500)),
    )

    const error = await captureApiError(flow())

    expect(error.category).toBe('server-error')
    expect(error.message).toBe('Stock Events no responde')
  })
})
