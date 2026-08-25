import { describe, expect, it, vi } from 'vitest'

import {
  buildStockEventsCashTransactionPayload,
  buildStockEventsTransactionPayload,
  findSyncedMapping,
} from '../../src/domain/stockevents/transaction-payload'
import {
  checkStockEventsSymbols,
  createStockEventsTransaction,
} from '../../src/lib/server/stockevents'
import { normalizeState } from '../../src/scripts/state'
import type { StockEventsSettings, Transaction } from '../../src/scripts/types'

const buyMovement: Transaction = {
  id: 'tx-1',
  date: '2026-07-15',
  month: 6,
  type: 'investment',
  accountId: 'broker',
  category: 'ETF',
  description: 'Compra VWCE',
  amount: 1004.5,
  time: '10:30',
  symbol: 'VWCE',
  side: 'buy',
  unitPrice: 100,
  units: 10,
  fee: 4.5,
  movementCurrency: 'EUR',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('payload de transacción para Stock Events', () => {
  it('construye una compra con fecha ISO, títulos, precio y comisión', () => {
    const payload = buildStockEventsTransactionPayload(buyMovement, 'wl-1')
    expect(payload).toMatchObject({
      watchlistId: 'wl-1',
      symbol: 'VWCE',
      date: '2026-07-15T10:30:00Z',
      change: 10,
      price: 100,
      priceCurrency: 'EUR',
      feesAmount: 4.5,
      feesCurrency: 'EUR',
      type: 'buy',
    })
  })

  it('usa cambio negativo para ventas y omite comisión a cero', () => {
    const payload = buildStockEventsTransactionPayload(
      { ...buyMovement, side: 'sell', fee: 0, amount: -1000 },
      'wl-1',
    )
    expect(payload).toMatchObject({ change: -10, type: 'sell' })
    expect(payload).not.toHaveProperty('feesAmount')
  })

  it('usa el símbolo destino de Stock Events cuando está definido', () => {
    const payload = buildStockEventsTransactionPayload(buyMovement, 'wl-1', 'aged.mi')
    expect(payload?.symbol).toBe('AGED.MI')
    expect(buildStockEventsTransactionPayload(buyMovement, 'wl-1', '  ')?.symbol).toBe('VWCE')
  })

  it('incluye la operación de efectivo sólo cuando se solicita', () => {
    expect(buildStockEventsTransactionPayload(buyMovement, 'wl-1')).not.toHaveProperty('toCash')
    expect(buildStockEventsTransactionPayload(buyMovement, 'wl-1', '', true)).toMatchObject({
      toCash: true,
    })
  })

  it('rechaza movimientos sin datos válidos', () => {
    expect(buildStockEventsTransactionPayload({ ...buyMovement, units: 0 }, 'wl-1')).toBeNull()
    expect(
      buildStockEventsTransactionPayload({ ...buyMovement, symbol: undefined }, 'wl-1'),
    ).toBeNull()
    expect(buildStockEventsTransactionPayload(buyMovement, '')).toBeNull()
  })

  it('construye un aporte de efectivo con el formato CASH de Stock Events', () => {
    expect(
      buildStockEventsCashTransactionPayload({
        watchlistId: 'wl-cash',
        date: '2026-07-19',
        amount: 125.499,
        currency: 'eur',
        accountName: 'MyInvestor',
      }),
    ).toEqual({
      watchlistId: 'wl-cash',
      symbol: 'CASH_EUR',
      date: '2026-07-19T00:00:00Z',
      change: 1,
      price: 125.5,
      priceCurrency: 'EUR',
      toCash: true,
      notes: 'Aporte desde finance-tracker · MyInvestor',
      type: 'DEFAULT',
    })
  })
})

describe('resolución del mapeo de símbolos', () => {
  const settings: StockEventsSettings = {
    enabled: true,
    apiKey: 'se_live_x',
    symbolMappings: [
      { symbol: 'VWCE', sync: true, watchlistId: 'wl-1', targetSymbol: '', hidden: false },
      { symbol: 'BTC', sync: false, watchlistId: 'wl-1', targetSymbol: '', hidden: false },
      { symbol: 'MSFT', sync: true, watchlistId: '', targetSymbol: '', hidden: false },
    ],
  }

  it('devuelve el mapeo solo si está habilitado, con sync y lista', () => {
    expect(findSyncedMapping(settings, 'vwce')?.watchlistId).toBe('wl-1')
    expect(findSyncedMapping(settings, 'BTC')).toBeNull()
    expect(findSyncedMapping(settings, 'MSFT')).toBeNull()
    expect(findSyncedMapping({ ...settings, enabled: false }, 'VWCE')).toBeNull()
    expect(findSyncedMapping({ ...settings, apiKey: '' }, 'VWCE')?.watchlistId).toBe('wl-1')
  })
})

describe('normalización del estado de Stock Events', () => {
  it('aplica valores por defecto cuando no existe configuración', () => {
    const state = normalizeState({})
    expect(state.stockEvents).toEqual({
      enabled: false,
      apiKey: '',
      symbolMappings: [],
      cashMappings: [],
      cashSyncEntries: [],
    })
  })

  it('sanea símbolos duplicados y campos inválidos', () => {
    const state = normalizeState({
      stockEvents: {
        enabled: true,
        apiKey: ' se_live_key ',
        symbolMappings: [
          {
            symbol: 'vwce',
            sync: true,
            watchlistId: 'wl-1',
            targetSymbol: 'vwce.de ',
            hidden: true,
          },
          { symbol: 'VWCE', sync: false, watchlistId: 'wl-2' },
          { symbol: '', sync: true, watchlistId: 'wl-3' },
          { symbol: 'btc', sync: 'yes', watchlistId: 42 },
        ],
        cashMappings: [
          { accountId: 'myinvestor', watchlistId: ' wl-cash ' },
          { accountId: 'myinvestor', watchlistId: 'duplicate' },
          { accountId: '', watchlistId: 'invalid' },
        ],
        cashSyncEntries: [
          {
            contributionDate: '2026-07-19',
            accountId: 'myinvestor',
            watchlistId: 'wl-cash',
            syncedAmount: 125.505,
          },
          {
            contributionDate: 'invalid',
            accountId: 'myinvestor',
            watchlistId: 'wl-cash',
            syncedAmount: 100,
          },
        ],
      },
    })
    expect(state.stockEvents.enabled).toBe(true)
    expect(state.stockEvents.apiKey).toBe('se_live_key')
    expect(state.stockEvents.symbolMappings).toEqual([
      {
        symbol: 'VWCE',
        sync: true,
        watchlistId: 'wl-1',
        targetSymbol: 'VWCE.DE',
        hidden: true,
      },
      { symbol: 'BTC', sync: false, watchlistId: '42', targetSymbol: '', hidden: false },
    ])
    expect(state.stockEvents.cashMappings).toEqual([
      { accountId: 'myinvestor', watchlistId: 'wl-cash' },
    ])
    expect(state.stockEvents.cashSyncEntries).toEqual([
      {
        contributionDate: '2026-07-19',
        accountId: 'myinvestor',
        watchlistId: 'wl-cash',
        syncedAmount: 125.51,
      },
    ])
  })
})

describe('comprobación de símbolos contra Stock Events', () => {
  it('marca como en lista los presentes y valida el resto con alta y borrado', async () => {
    const calls: Array<{ url: string; method: string }> = []
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'
      calls.push({ url, method })
      if (url.endsWith('/watchlists/wl-1/symbols') && method === 'GET') {
        return jsonResponse({ data: [{ symbol: 'VWCE', isDeleted: false }] })
      }
      if (url.endsWith('/watchlists/wl-1/symbols') && method === 'POST') {
        return jsonResponse({ data: { watchlistId: 'wl-1', symbol: 'AAPL' } }, 201)
      }
      if (method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      return jsonResponse({ error: { code: 'not_found', message: 'no' } }, 404)
    })

    const results = await checkStockEventsSymbols(
      'se_live_x',
      [
        { symbol: 'VWCE', watchlistId: 'wl-1' },
        { symbol: 'AAPL', watchlistId: 'wl-1' },
      ],
      fetchMock,
    )

    expect(results).toEqual([
      { symbol: 'VWCE', watchlistId: 'wl-1', status: 'in-watchlist' },
      { symbol: 'AAPL', watchlistId: 'wl-1', status: 'detected' },
    ])
    expect(calls.filter((call) => call.method === 'GET')).toHaveLength(1)
    expect(calls.some((call) => call.method === 'DELETE' && call.url.includes('AAPL'))).toBe(true)
  })

  it('reporta como no detectado un símbolo que Stock Events rechaza', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const method = init?.method || 'GET'
      if (method === 'GET') return jsonResponse({ data: [] })
      return jsonResponse({ error: { code: 'unknown_symbol', message: 'Unknown symbol' } }, 422)
    })
    const results = await checkStockEventsSymbols(
      'se_live_x',
      [{ symbol: 'NOPE', watchlistId: 'wl-1' }],
      fetchMock,
    )
    expect(results[0]).toMatchObject({ symbol: 'NOPE', status: 'not-detected' })
  })

  it('propaga errores de autenticación en lugar de marcarlos por símbolo', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: { code: 'unauthorized', message: 'nope' } }, 401),
    )
    await expect(
      checkStockEventsSymbols('bad-key', [{ symbol: 'VWCE', watchlistId: 'wl-1' }], fetchMock),
    ).rejects.toThrow('API key inválida o revocada')
  })
})

describe('creación de transacciones en Stock Events', () => {
  it('añade el símbolo a la lista si falta y luego crea la transacción', async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = []
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url.endsWith('/watchlists/wl-1/symbols') && method === 'GET') {
        return jsonResponse({ data: [] })
      }
      if (url.endsWith('/watchlists/wl-1/symbols') && method === 'POST') {
        return jsonResponse({ data: { watchlistId: 'wl-1', symbol: 'VWCE' } }, 201)
      }
      if (url.endsWith('/transactions') && method === 'POST') {
        return jsonResponse({ data: { id: 'se-tx-1', watchlistId: 'wl-1', symbol: 'VWCE' } }, 201)
      }
      return jsonResponse({ error: { code: 'not_found', message: 'no' } }, 404)
    })

    const created = await createStockEventsTransaction(
      'se_live_x',
      {
        watchlistId: 'wl-1',
        symbol: 'VWCE',
        date: '2026-07-15T10:30:00Z',
        change: 10,
        price: 100,
        priceCurrency: 'EUR',
        type: 'buy',
      },
      fetchMock,
    )

    expect(created).toEqual({ id: 'se-tx-1', watchlistId: 'wl-1', symbol: 'VWCE' })
    const transactionCall = calls.find((call) => call.url.endsWith('/transactions'))
    expect(transactionCall?.body).toMatchObject({ symbol: 'VWCE', change: 10, price: 100 })
    expect(
      calls.some((call) => call.method === 'POST' && call.url.endsWith('/watchlists/wl-1/symbols')),
    ).toBe(true)
    const authHeader = (fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>)
      ?.Authorization
    expect(authHeader).toBe('Bearer se_live_x')
  })

  it('crea efectivo sin intentar añadir CASH como símbolo de la lista', async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = []
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      return jsonResponse({ data: { id: 'se-cash-1', watchlistId: 'wl-1', symbol: 'CASH_EUR' } }, 201)
    })

    await createStockEventsTransaction(
      'se_live_x',
      {
        watchlistId: 'wl-1',
        symbol: 'CASH_EUR',
        date: '2026-07-19T00:00:00Z',
        change: 1,
        price: 100,
        priceCurrency: 'EUR',
        toCash: true,
        type: 'DEFAULT',
      },
      fetchMock,
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      method: 'POST',
      body: { symbol: 'CASH_EUR', price: 100, toCash: true },
    })
    expect(calls[0]?.url).toMatch(/\/transactions$/)
  })

  it('representa una corrección negativa de efectivo con change negativo', () => {
    expect(
      buildStockEventsCashTransactionPayload({
        watchlistId: 'wl-1',
        date: '2026-07-19',
        amount: -25.5,
        currency: 'EUR',
      }),
    ).toMatchObject({ change: -1, price: 25.5, toCash: true })
  })
})
