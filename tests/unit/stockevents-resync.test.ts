import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizeState } from '../../src/scripts/state'
import type { Transaction } from '../../src/scripts/types'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useInvestmentStore } from '../../src/stores/investment'
import { useStockEventsStore } from '../../src/stores/stockevents'

/**
 * Regression coverage for the silent-loss path: an ETH buy
 * (0.0047 @ 2110.30) was saved locally and never reached Stock Events
 * because `syncMovement` returned without a word when no synced mapping
 * resolved. These tests pin the three new guarantees — a visible skip
 * warning, a manual per-movement resend, and a resend on edit.
 */

const ethBuy: Transaction = {
  id: 'tx-eth-buy',
  date: '2026-07-15',
  month: 7,
  type: 'investment',
  accountId: 'broker',
  category: 'Crypto',
  description: 'Compra 0.0047 ETH',
  amount: 9.92,
  time: '10:30',
  symbol: 'ETH',
  side: 'buy',
  unitPrice: 2110.3,
  units: 0.0047,
  fee: 0,
  movementCurrency: 'EUR',
  declared: false,
}

const btcBuy: Transaction = {
  ...ethBuy,
  id: 'tx-btc-buy',
  symbol: 'BTC',
  description: 'Compra 0.0047 BTC',
}

function seedState(transactions: Transaction[], tradesToCash = false): void {
  useFinancialStateStore().replaceState(
    normalizeState({
      accounts: [{ id: 'broker', name: 'Broker', openingBalance: 0 }],
      investmentCategories: ['Crypto'],
      transactions,
      stockEvents: {
        enabled: true,
        apiKey: '',
        tradesToCash,
        symbolMappings: [
          { symbol: 'ETH', sync: true, watchlistId: 'wl-1', targetSymbol: '', hidden: false },
        ],
      },
    }),
  )
}

/** Lo que Stock Events recibió por HTTP: el borde externo que sustituye al servicio propio. */
let transactionsPosted: Array<Record<string, unknown>>
let symbolChecksPosted: Array<Array<Record<string, unknown>>>
let credentialConfigured: boolean
let transactionResponse: () => Response
let toast: { textContent: string }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function toastText(): string {
  return toast.textContent
}

beforeEach(() => {
  setActivePinia(createPinia())
  toast = { textContent: '', dataset: {}, hasAttribute: () => false } as never
  vi.stubGlobal('document', { getElementById: (id: string) => (id === 'toast' ? toast : null) })
  transactionsPosted = []
  symbolChecksPosted = []
  credentialConfigured = true
  transactionResponse = () =>
    json({ transaction: { id: 'se-tx-1', watchlistId: 'wl-1', symbol: 'ETH' } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      if (url === '/api/integrations/stockevents') return json({ configured: credentialConfigured })
      if (url === '/api/stockevents/transactions') {
        transactionsPosted.push(body.transaction)
        return transactionResponse()
      }
      if (url === '/api/stockevents/check-symbols') {
        symbolChecksPosted.push(body.checks)
        return json({ results: [] })
      }
      throw new Error(`unexpected fetch ${url}`)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('stockEvents syncMovement — skip warning', () => {
  it('avisa y no llama a la API cuando el símbolo no tiene mapeo sincronizado', async () => {
    seedState([btcBuy])
    const store = useStockEventsStore()
    await store.initializeCredential()
    expect(store.isConnected).toBe(true)

    const result = await store.syncMovement(btcBuy)

    expect(result).toBe('skipped')
    expect(transactionsPosted).toEqual([])
    expect(toastText()).toBe('Stock Events: BTC no tiene sincronización activada o lista asignada.')
  })

  it('se mantiene en silencio cuando no hay conexión con Stock Events', async () => {
    seedState([btcBuy])
    credentialConfigured = false
    const store = useStockEventsStore()
    await store.initializeCredential()
    expect(store.isConnected).toBe(false)

    const result = await store.syncMovement(btcBuy)

    expect(result).toBe('skipped')
    expect(transactionsPosted).toEqual([])
    expect(toastText()).toBe('')
  })

  it('avisa y no llama a la API cuando el movimiento no tiene datos válidos', async () => {
    seedState([{ ...ethBuy, units: 0 }])
    const store = useStockEventsStore()
    await store.initializeCredential()

    const result = await store.syncMovement({ ...ethBuy, units: 0 })

    expect(result).toBe('skipped')
    expect(transactionsPosted).toEqual([])
    expect(toastText()).toBe(
      'Stock Events: el movimiento de ETH no tiene datos válidos para sincronizar.',
    )
  })
})

it('comprueba el ticker cripto efectivo en Stock Events', async () => {
  seedState([ethBuy])
  const store = useStockEventsStore()
  await store.initializeCredential()

  await store.checkSymbols()

  expect(symbolChecksPosted).toEqual([[{ symbol: 'ETH.CRYPTO', watchlistId: 'wl-1' }]])
})

describe('stockEvents syncMovement — éxito y fallo', () => {
  it('envía la compra de ETH con el payload correcto y devuelve synced', async () => {
    seedState([ethBuy])
    const store = useStockEventsStore()
    await store.initializeCredential()

    const result = await store.syncMovement(ethBuy)

    expect(result).toBe('synced')
    expect(transactionsPosted).toHaveLength(1)
    expect(transactionsPosted[0]).toMatchObject({
      watchlistId: 'wl-1',
      symbol: 'ETH.CRYPTO',
      date: '2026-07-15T10:30:00Z',
      change: 0.0047,
      price: 2110.3,
      priceCurrency: 'EUR',
      type: 'buy',
    })
    expect(toastText()).toBe('Movimiento de ETH.CRYPTO sincronizado con Stock Events.')
  })

  it('devuelve failed cuando Stock Events rechaza la petición', async () => {
    seedState([ethBuy])
    transactionResponse = () => json({ error: 'límite alcanzado' }, 422)
    const store = useStockEventsStore()
    await store.initializeCredential()

    const result = await store.syncMovement(ethBuy)

    expect(result).toBe('failed')
    expect(toastText()).toBe('Stock Events: límite alcanzado')
  })
})

describe('investment store — reenvío manual', () => {
  it('reenvía el movimiento sembrado y devuelve true', async () => {
    seedState([ethBuy])
    const store = useStockEventsStore()
    await store.initializeCredential()
    const investmentStore = useInvestmentStore()

    const result = await investmentStore.resyncMovement(ethBuy.id)

    expect(result).toBe(true)
    expect(transactionsPosted).toHaveLength(1)
    expect(transactionsPosted[0]).toMatchObject({
      symbol: 'ETH.CRYPTO',
      change: 0.0047,
      price: 2110.3,
    })
  })

  it('avisa cuando el movimiento no existe y no llama a la API', async () => {
    seedState([ethBuy])
    const store = useStockEventsStore()
    await store.initializeCredential()
    const investmentStore = useInvestmentStore()

    const result = await investmentStore.resyncMovement('tx-inexistente')

    expect(result).toBe(false)
    expect(transactionsPosted).toEqual([])
    expect(toastText()).toBe('Movimiento no encontrado.')
  })

  it('pide activar la conexión cuando el reenvío queda en skipped sin conexión', async () => {
    seedState([btcBuy])
    credentialConfigured = false
    const store = useStockEventsStore()
    await store.initializeCredential()
    expect(store.isConnected).toBe(false)
    const investmentStore = useInvestmentStore()

    const result = await investmentStore.resyncMovement(btcBuy.id)

    expect(result).toBe(false)
    expect(transactionsPosted).toEqual([])
    expect(toastText()).toBe('Activa la conexión con Stock Events para reenviar.')
  })
})

describe('investment store — sincronización al editar', () => {
  it('reenvía el movimiento actualizado tras guardar la edición', async () => {
    seedState([ethBuy])
    const store = useStockEventsStore()
    await store.initializeCredential()
    const investmentStore = useInvestmentStore()

    const saved = investmentStore.saveEditedMovement(ethBuy.id, {
      date: '2026-07-16',
      time: '11:45',
      side: 'buy',
      symbol: 'ETH',
      category: 'Crypto',
      unitPrice: '2110.30',
      units: '0.0047',
      fee: '0',
      movementCurrency: 'EUR',
      accountId: 'broker',
      declared: false,
    })
    // The resend is fire-and-forget: wait for the request Stock Events receives.
    await vi.waitFor(() => expect(transactionsPosted).toHaveLength(1))

    expect(saved).toBe(true)
    expect(transactionsPosted[0]).toMatchObject({
      symbol: 'ETH.CRYPTO',
      date: '2026-07-16T11:45:00Z',
      change: 0.0047,
      price: 2110.3,
      type: 'buy',
    })
  })
})

describe('stockEvents syncMovement — ajuste global de efectivo', () => {
  it('no envía toCash cuando el ajuste está desactivado', async () => {
    seedState([ethBuy])
    const store = useStockEventsStore()
    await store.initializeCredential()

    await store.syncMovement(ethBuy)

    expect(transactionsPosted[0]).not.toHaveProperty('toCash')
  })

  it('el reenvío manual descuenta efectivo cuando el ajuste está activado', async () => {
    seedState([ethBuy], true)
    await useStockEventsStore().initializeCredential()

    await useInvestmentStore().resyncMovement(ethBuy.id)

    expect(transactionsPosted[0]).toMatchObject({
      toCash: true,
    })
  })

  it('la opción del movimiento prevalece sobre el ajuste global', async () => {
    seedState([ethBuy], true)
    const store = useStockEventsStore()
    await store.initializeCredential()

    await store.syncMovement(ethBuy, { toCash: false })

    expect(transactionsPosted[0]).not.toHaveProperty('toCash')
  })
})
