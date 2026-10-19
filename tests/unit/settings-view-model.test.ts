import { describe, expect, it } from 'vitest'

import {
  buildAccountRows,
  buildAssetsViewModel,
  buildQuoteSymbolRows,
  summarizeStockEventsSync,
} from '../../src/domain/settings/view-model'
import type { Instrument, State, Transaction } from '../../src/scripts/types'

function instrument(partial: Partial<Instrument> & Pick<Instrument, 'id' | 'symbol'>): Instrument {
  return {
    investmentAssetId: 'fund',
    type: 'etf',
    market: '',
    currency: 'EUR',
    provider: 'twelve-data',
    active: true,
    ...partial,
  }
}

function buy(partial: Partial<Transaction>): Transaction {
  return {
    id: `tx-${Math.random()}`,
    type: 'investment',
    date: '2026-07-01',
    amount: 100,
    category: 'Fondo',
    description: '',
    accountId: 'bank',
    ...partial,
  } as Transaction
}

/** The slice of the state the settings views read. */
function state(overrides: Partial<State> = {}): State {
  return {
    accounts: [
      { id: 'bank', name: 'Banco', openingBalance: 1000 },
      { id: 'broker', name: 'Bróker · efectivo', openingBalance: 50 },
    ],
    investmentAssets: [
      { id: 'fund', name: 'Fondo', openingBalance: 2000 },
      { id: 'gold', name: 'Oro', openingBalance: 300 },
    ],
    liabilities: [],
    instruments: [],
    transactions: [],
    twrLiquidityAccountIds: ['broker'],
    stockEvents: {
      enabled: true,
      apiKey: '',
      symbolMappings: [],
      cashMappings: [{ accountId: 'broker', watchlistId: 'wl-cash' }],
    },
    ...overrides,
  } as unknown as State
}

describe('buildAccountRows', () => {
  it('gives each account its liquidity mark and its Stock Events cash list', () => {
    expect(buildAccountRows(state())).toEqual([
      { id: 'bank', name: 'Banco', openingBalance: 1000, twrLiquidity: false, cashWatchlistId: '' },
      {
        id: 'broker',
        name: 'Bróker · efectivo',
        openingBalance: 50,
        twrLiquidity: true,
        cashWatchlistId: 'wl-cash',
      },
    ])
  })

  it('ignores a cash list left behind by an account that is no longer liquidity', () => {
    const rows = buildAccountRows(state({ twrLiquidityAccountIds: [] }))

    expect(rows.find((row) => row.id === 'broker')?.cashWatchlistId).toBe('')
  })
})

describe('buildAssetsViewModel', () => {
  it('lists every asset with its instruments and their linked and pending movements', () => {
    const vm = buildAssetsViewModel(
      state({
        instruments: [instrument({ id: 'vwce', symbol: 'VWCE' })],
        transactions: [
          buy({ symbol: 'VWCE', instrumentId: 'vwce' }),
          buy({ symbol: 'VWCE', instrumentId: 'vwce' }),
          buy({ symbol: 'VWCE' }),
        ],
      }),
    )

    const fund = vm.assets.find((asset) => asset.id === 'fund')!
    expect(fund.instruments).toEqual([
      expect.objectContaining({ id: 'vwce', symbol: 'VWCE', linked: 2, pending: 1 }),
    ])
    expect(fund).toMatchObject({ linked: 2, pending: 1, symbols: ['VWCE'] })
    expect(vm.assets.find((asset) => asset.id === 'gold')).toMatchObject({
      instruments: [],
      linked: 0,
      pending: 0,
      symbols: [],
    })
  })

  it('counts a movement without symbol as pending when its category is the asset', () => {
    const vm = buildAssetsViewModel(
      state({
        instruments: [instrument({ id: 'vwce', symbol: 'VWCE' })],
        transactions: [buy({ category: 'Fondo' })],
      }),
    )

    expect(vm.assets[0].pending).toBe(1)
  })

  it('gives an asset the symbols its movements use, not only its instrument symbol', () => {
    const vm = buildAssetsViewModel(
      state({
        instruments: [
          instrument({
            id: 'aged',
            symbol: 'AGED.MI',
            provider: 'yahoo',
            investmentAssetId: 'gold',
          }),
        ],
        transactions: [buy({ symbol: 'AGED', category: 'Otra' })],
      }),
    )

    expect(vm.assets.find((asset) => asset.id === 'gold')?.symbols).toEqual(['AGED', 'AGED.MI'])
    expect(vm.orphanSymbols).toEqual([])
  })

  it('assigns a symbol by the category of its movements when no instrument matches', () => {
    const vm = buildAssetsViewModel(
      state({ transactions: [buy({ symbol: 'sgln', category: 'Oro' })] }),
    )

    expect(vm.assets.find((asset) => asset.id === 'gold')?.symbols).toEqual(['SGLN'])
  })

  it('leaves apart the symbols that belong to no asset', () => {
    const vm = buildAssetsViewModel(
      state({ transactions: [buy({ symbol: 'SXRS', category: 'Sin activo' })] }),
    )

    expect(vm.orphanSymbols).toEqual(['SXRS'])
    expect(vm.assets.every((asset) => asset.symbols.length === 0)).toBe(true)
  })
})

describe('buildAssetsViewModel · activos que ya no existen', () => {
  it('leaves apart the symbols of an instrument whose asset is gone', () => {
    const vm = buildAssetsViewModel(
      state({
        instruments: [instrument({ id: 'old', symbol: 'OLD', investmentAssetId: 'deleted' })],
        transactions: [buy({ symbol: 'OLD', instrumentId: 'old', category: 'Borrado' })],
      }),
    )

    expect(vm.orphanSymbols).toEqual(['OLD'])
  })
})

describe('buildQuoteSymbolRows', () => {
  it('lists symbols independently of categories, including symbols without an asset', () => {
    const rows = buildQuoteSymbolRows(
      state({
        transactions: [
          buy({ id: 'one', symbol: 'FIRST' }),
          buy({ id: 'two', symbol: 'SECOND' }),
          buy({ id: 'three', symbol: ' first ', category: 'Otra categoría' }),
          buy({ id: 'four', symbol: 'ORPH', category: 'Sin activo' }),
          buy({ id: 'five' }),
        ],
      }),
    )

    expect(rows.map((row) => [row.symbol, row.movements, row.assetId])).toEqual([
      ['FIRST', 2, 'fund'],
      ['ORPH', 1, ''],
      ['SECOND', 1, 'fund'],
    ])
    expect(rows[0].categories).toEqual(['Fondo', 'Otra categoría'])
    expect(rows.every((row) => row.instrument === null)).toBe(true)
  })

  it('shows the configured Yahoo ticker once for its matching movement symbols', () => {
    const rows = buildQuoteSymbolRows(
      state({
        instruments: [instrument({ id: 'aged', symbol: 'AGED.MI', provider: 'yahoo' })],
        transactions: [
          buy({ id: 'one', symbol: 'AGED' }),
          buy({ id: 'two', symbol: 'AGED.MI', instrumentId: 'aged' }),
        ],
      }),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      symbol: 'AGED.MI',
      movements: 2,
      instrument: { linked: 1, pending: 1 },
    })
  })

  it('keeps configured symbols visible even if their asset no longer exists', () => {
    const rows = buildQuoteSymbolRows(
      state({
        instruments: [instrument({ id: 'old', symbol: 'OLD', investmentAssetId: 'deleted' })],
      }),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ symbol: 'OLD', movements: 0, instrument: { id: 'old' } })
  })
})

describe('summarizeStockEventsSync', () => {
  const row = (partial: object) => ({
    sync: true,
    watchlistId: 'wl',
    checkResult: null,
    ...partial,
  })

  it('says nothing syncs when no symbol syncs with a list', () => {
    expect(summarizeStockEventsSync([])).toEqual({ label: 'Sin símbolo', tone: null })
    expect(summarizeStockEventsSync([row({ sync: false })])).toEqual({
      label: 'No se sincroniza',
      tone: null,
    })
  })

  it('warns when a synced symbol has no list or Stock Events does not find it', () => {
    expect(summarizeStockEventsSync([row({ watchlistId: '' })])).toEqual({
      label: 'Falta la lista',
      tone: 'warn',
    })
    expect(
      summarizeStockEventsSync([
        row({ checkResult: { status: 'in-watchlist' } }),
        row({ checkResult: { status: 'not-detected' } }),
      ]),
    ).toEqual({ label: 'No detectado', tone: 'warn' })
  })

  it('reports a synced, checked symbol as found', () => {
    expect(summarizeStockEventsSync([row({ checkResult: { status: 'detected' } })])).toEqual({
      label: 'Detectado',
      tone: 'gain',
    })
    expect(summarizeStockEventsSync([row({})])).toEqual({ label: 'Sincroniza', tone: 'gain' })
  })
})
