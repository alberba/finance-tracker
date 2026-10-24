// @vitest-environment happy-dom
import { Effect } from 'effect'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/services/stockevents-api', () => ({
  fetchStockEventsCredentialStatus: vi.fn(),
  createStockEventsTransaction: vi.fn(),
  checkStockEventsSymbols: vi.fn(),
}))

import { normalizeState } from '../../src/scripts/state'
import type { Transaction } from '../../src/scripts/types'
import {
  createStockEventsTransaction,
  checkStockEventsSymbols,
  fetchStockEventsCredentialStatus,
} from '../../src/services/stockevents-api'
import { ApiClientError } from '../../src/lib/client/api-error'
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
  month: 6,
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

function toastText(): string {
  return document.getElementById('toast')?.textContent || ''
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  document.body.innerHTML = '<div id="toast"></div>'
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(fetchStockEventsCredentialStatus).mockReturnValue(Effect.succeed(true))
  vi.mocked(createStockEventsTransaction).mockReturnValue(
    Effect.succeed({
      id: 'se-tx-1',
      watchlistId: 'wl-1',
      symbol: 'ETH',
    }),
  )
  vi.mocked(checkStockEventsSymbols).mockReturnValue(Effect.succeed([]))
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('stockEvents syncMovement — skip warning', () => {
  it('avisa y no llama a la API cuando el símbolo no tiene mapeo sincronizado', async () => {
    seedState([btcBuy])
    const store = useStockEventsStore()
    await store.initializeCredential()
    expect(store.isConnected).toBe(true)

    const result = await store.syncMovement(btcBuy)

    expect(result).toBe('skipped')
    expect(createStockEventsTransaction).not.toHaveBeenCalled()
    expect(toastText()).toBe('Stock Events: BTC no tiene sincronización activada o lista asignada.')
    expect(console.warn).toHaveBeenCalled()
  })

  it('se mantiene en silencio cuando no hay conexión con Stock Events', async () => {
    seedState([btcBuy])
    vi.mocked(fetchStockEventsCredentialStatus).mockReturnValue(Effect.succeed(false))
    const store = useStockEventsStore()
    await store.initializeCredential()
    expect(store.isConnected).toBe(false)

    const result = await store.syncMovement(btcBuy)

    expect(result).toBe('skipped')
    expect(createStockEventsTransaction).not.toHaveBeenCalled()
    expect(toastText()).toBe('')
  })

  it('avisa y no llama a la API cuando el movimiento no tiene datos válidos', async () => {
    seedState([{ ...ethBuy, units: 0 }])
    const store = useStockEventsStore()
    await store.initializeCredential()

    const result = await store.syncMovement({ ...ethBuy, units: 0 })

    expect(result).toBe('skipped')
    expect(createStockEventsTransaction).not.toHaveBeenCalled()
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

  expect(checkStockEventsSymbols).toHaveBeenCalledWith([
    { symbol: 'ETH.CRYPTO', watchlistId: 'wl-1' },
  ])
})

describe('stockEvents syncMovement — éxito y fallo', () => {
  it('envía la compra de ETH con el payload correcto y devuelve synced', async () => {
    seedState([ethBuy])
    const store = useStockEventsStore()
    await store.initializeCredential()

    const result = await store.syncMovement(ethBuy)

    expect(result).toBe('synced')
    expect(createStockEventsTransaction).toHaveBeenCalledTimes(1)
    expect(vi.mocked(createStockEventsTransaction).mock.calls[0]?.[0]).toMatchObject({
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
    vi.mocked(createStockEventsTransaction).mockReturnValue(
      Effect.fail(
        new ApiClientError('api-error', {
          endpoint: '/api/stockevents/transactions',
          fallbackMessage: 'No se pudo sincronizar con Stock Events',
          serverMessage: 'límite alcanzado',
        }),
      ),
    )
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
    expect(createStockEventsTransaction).toHaveBeenCalledTimes(1)
    expect(vi.mocked(createStockEventsTransaction).mock.calls[0]?.[0]).toMatchObject({
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
    expect(createStockEventsTransaction).not.toHaveBeenCalled()
    expect(toastText()).toBe('Movimiento no encontrado.')
  })

  it('pide activar la conexión cuando el reenvío queda en skipped sin conexión', async () => {
    seedState([btcBuy])
    vi.mocked(fetchStockEventsCredentialStatus).mockReturnValue(Effect.succeed(false))
    const store = useStockEventsStore()
    await store.initializeCredential()
    expect(store.isConnected).toBe(false)
    const investmentStore = useInvestmentStore()

    const result = await investmentStore.resyncMovement(btcBuy.id)

    expect(result).toBe(false)
    expect(createStockEventsTransaction).not.toHaveBeenCalled()
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
    await settle()

    expect(saved).toBe(true)
    expect(createStockEventsTransaction).toHaveBeenCalledTimes(1)
    expect(vi.mocked(createStockEventsTransaction).mock.calls[0]?.[0]).toMatchObject({
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

    expect(vi.mocked(createStockEventsTransaction).mock.calls[0]?.[0]).not.toHaveProperty('toCash')
  })

  it('el reenvío manual descuenta efectivo cuando el ajuste está activado', async () => {
    seedState([ethBuy], true)
    await useStockEventsStore().initializeCredential()

    await useInvestmentStore().resyncMovement(ethBuy.id)

    expect(vi.mocked(createStockEventsTransaction).mock.calls[0]?.[0]).toMatchObject({
      toCash: true,
    })
  })

  it('la opción del movimiento prevalece sobre el ajuste global', async () => {
    seedState([ethBuy], true)
    const store = useStockEventsStore()
    await store.initializeCredential()

    await store.syncMovement(ethBuy, { toCash: false })

    expect(vi.mocked(createStockEventsTransaction).mock.calls[0]?.[0]).not.toHaveProperty('toCash')
  })
})
