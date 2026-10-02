import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildPortfolioValuation } from '../../src/domain/investment/valuation'
import { generatePendingMovements } from '../../src/domain/recurring/pending'
import { getDueOccurrences, nextOccurrenceDate } from '../../src/domain/recurring/occurrences'
import { normalizeState } from '../../src/scripts/state'
import type { RecurringRule, State } from '../../src/scripts/types'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useMarketStore } from '../../src/stores/market'
import { useRecurringStore } from '../../src/stores/recurring'

function recurringRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'rule-rent', type: 'expense', accountId: 'checking', category: 'Vivienda', description: 'Alquiler', amount: 900,
    frequency: 'monthly', interval: 1, startDate: '2024-01-15', endDate: null, active: true,
    lastExecutionDate: null, nextOccurrenceDate: '2024-01-15', ...overrides,
  }
}

function stateWithRecurring(rule: RecurringRule): Pick<State, 'recurringRules' | 'pendingMovements'> {
  return { recurringRules: [rule], pendingMovements: [] }
}

describe('reglas recurrentes y pendientes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calcula frecuencias, intervalos y fin de mes', () => {
    expect(getDueOccurrences(recurringRule({ frequency: 'daily', interval: 2, startDate: '2024-01-01', nextOccurrenceDate: '2024-01-01' }), '2024-01-06')).toEqual([
      '2024-01-01', '2024-01-03', '2024-01-05',
    ])
    expect(getDueOccurrences(recurringRule({ frequency: 'weekly', interval: 2, startDate: '2024-01-01', nextOccurrenceDate: '2024-01-01' }), '2024-02-01')).toEqual([
      '2024-01-01', '2024-01-15', '2024-01-29',
    ])
    expect(nextOccurrenceDate(recurringRule({ frequency: 'monthEnd', interval: 1 }), '2024-01-31')).toBe('2024-02-29')
    expect(getDueOccurrences(recurringRule({ frequency: 'monthEnd', startDate: '2024-01-01', nextOccurrenceDate: '2024-01-01' }), '2024-02-01')).toEqual(['2024-01-31'])
    expect(nextOccurrenceDate(recurringRule({ frequency: 'yearly', interval: 1 }), '2024-02-29')).toBe('2025-02-28')
  })

  it('genera vencimientos atrasados sin duplicarlos al recargar', () => {
    const first = generatePendingMovements(stateWithRecurring(recurringRule()), '2024-03-20')
    expect(first.createdCount).toBe(3)
    expect(first.pendingMovements.map((item) => item.occurrenceKey)).toEqual([
      'rule-rent:2024-01-15', 'rule-rent:2024-02-15', 'rule-rent:2024-03-15',
    ])

    const second = generatePendingMovements({ ...first, pendingMovements: first.pendingMovements }, '2024-03-20')
    expect(second.createdCount).toBe(0)
    expect(second.pendingMovements).toHaveLength(3)
  })

  it('migra estados antiguos y normaliza las nuevas colecciones', () => {
    const state = normalizeState({
      year: 2024,
      currency: 'eur',
      accounts: [{ id: 'checking', name: 'Cuenta', openingBalance: 0 }],
      investmentAssets: [{ id: 'fund', name: 'Fondo', openingBalance: 0 }],
      transactions: [],
      instruments: [{ investmentAssetId: 'fund', type: 'etf', symbol: 'vwce', currency: 'eur' }],
      quotes: { 'fund-vwce-': { price: '100', currency: 'EUR', timestamp: '2024-01-01T00:00:00Z' } },
    })
    expect(state.currency).toBe('EUR')
    expect(state.instruments[0].symbol).toBe('VWCE')
    expect(state.quotes['fund-vwce-'].price).toBe(100)
    expect(state.recurringRules).toEqual([])
    expect(state.pendingMovements).toEqual([])
  })

  it('conserva la precisión de títulos y precios en inversiones automatizadas', () => {
    const state = normalizeState({
      year: 2024,
      accounts: [{ id: 'broker', name: 'Broker', openingBalance: 0 }],
      investmentAssets: [{ id: 'crypto', name: 'Crypto', openingBalance: 0 }],
      recurringRules: [
        {
          id: 'rule-btc',
          type: 'investment',
          accountId: 'broker',
          category: 'Crypto',
          description: 'Compra BTC',
          amount: 12.34,
          symbol: 'BTC',
          side: 'buy',
          units: 0.00012345,
          unitPrice: 54321.123456,
          frequency: 'monthly',
          interval: 1,
          startDate: '2024-01-01',
          active: true,
          lastExecutionDate: null,
          nextOccurrenceDate: '2024-02-01',
        },
      ],
      pendingMovements: [
        {
          id: 'pending-eth',
          occurrenceKey: 'rule-eth:2024-01-01',
          ruleId: 'rule-eth',
          occurrenceDate: '2024-01-01',
          type: 'investment',
          accountId: 'broker',
          category: 'Crypto',
          description: 'Compra ETH',
          amount: 8.76,
          symbol: 'ETH',
          side: 'buy',
          units: 0.00456789,
          unitPrice: 3210.654321,
          status: 'pending',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          transactionId: null,
        },
      ],
    })

    expect(state.recurringRules[0].units).toBe(0.00012345)
    expect(state.recurringRules[0].unitPrice).toBe(54321.123456)
    expect(state.pendingMovements[0].units).toBe(0.00456789)
    expect(state.pendingMovements[0].unitPrice).toBe(3210.654321)
  })

  it('confirma, edita y mantiene pendientes fuera de transacciones hasta confirmar', () => {
    setActivePinia(createPinia())
    vi.stubGlobal('window', { __FINANCE_TODAY__: '2024-02-20' })
    const financialStore = useFinancialStateStore()
    financialStore.replaceState({
      year: 2024, currency: 'EUR', accounts: [{ id: 'checking', name: 'Cuenta', openingBalance: 0 }],
      investmentAssets: [], liabilities: [], incomeCategories: [], expenseCategories: ['Vivienda'], investmentCategories: [],
      transactions: [], snapshots: {}, budget: { income: {}, expense: {}, investment: {} }, goals: {}, contributions: [],
      recurringRules: [], pendingMovements: [], instruments: [], quotes: {},
    })
    const store = useRecurringStore()
    expect(store.addRule({ type: 'expense', accountId: 'checking', category: 'Vivienda', description: 'Alquiler', amount: 900, frequency: 'monthly', interval: 1, startDate: '2024-01-15' })).toBe(true)
    store.refreshPending('2024-02-20')
    expect(store.pendingCount).toBe(2)
    expect(financialStore.transactions).toHaveLength(0)
    const pendingId = store.openPendingMovements[0].id
    expect(store.editPending(pendingId, { date: '2024-01-16', accountId: 'checking', category: 'Vivienda', description: 'Alquiler editado', amount: 925 })).toBe(true)
    expect(store.confirmPending(pendingId)).toBe(true)
    expect(financialStore.transactions[0].description).toBe('Alquiler editado')
    expect(financialStore.transactions[0].amount).toBe(925)
    expect(store.pendingCount).toBe(1)
    vi.unstubAllGlobals()
  })

  it('edita un movimiento pendiente de inversión y permite reclasificar su tipo', () => {
    setActivePinia(createPinia())
    vi.stubGlobal('window', { __FINANCE_TODAY__: '2024-02-20' })
    const financialStore = useFinancialStateStore()
    financialStore.replaceState({
      year: 2024, currency: 'EUR',
      accounts: [{ id: 'checking', name: 'Cuenta', openingBalance: 0 }],
      investmentAssets: [{ id: 'broker-crypto', name: 'Binance', openingBalance: 0 }],
      liabilities: [],
      incomeCategories: [],
      expenseCategories: ['Vivienda'],
      investmentCategories: ['Cripto'],
      transactions: [], snapshots: {}, budget: { income: {}, expense: {}, investment: {} }, goals: {}, contributions: [],
      recurringRules: [],
      pendingMovements: [
        {
          id: 'pm-exp',
          occurrenceKey: 'rule-exp:2024-02-15',
          ruleId: 'rule-exp',
          occurrenceDate: '2024-02-15',
          type: 'expense',
          accountId: 'checking',
          category: 'Vivienda',
          description: 'Migrado sin tipo',
          amount: 100,
          status: 'pending',
          createdAt: '2024-02-15T00:00:00.000Z',
          updatedAt: '2024-02-15T00:00:00.000Z',
          transactionId: null,
        },
      ],
      instruments: [], quotes: {},
    })
    const store = useRecurringStore()
    expect(store.pendingCount).toBe(1)

    // Reclassify from expense to investment with investment account and operation fields
    const ok = store.editPending('pm-exp', {
      type: 'investment',
      date: '2024-02-16',
      accountId: 'broker-crypto',
      category: 'Cripto',
      description: 'Compra BTC',
      amount: 500,
      symbol: 'BTC',
      side: 'buy',
      units: 0.01,
      unitPrice: 50000,
      fee: 2.5,
      time: '11:00',
    })
    expect(ok).toBe(true)

    const edited = store.openPendingMovements[0]
    expect(edited.type).toBe('investment')
    expect(edited.accountId).toBe('broker-crypto')
    expect(edited.category).toBe('Cripto')
    expect(edited.symbol).toBe('BTC')
    expect(edited.side).toBe('buy')
    expect(edited.units).toBe(0.01)
    expect(edited.unitPrice).toBe(50000)
    expect(edited.fee).toBe(2.5)
    expect(edited.time).toBe('11:00')
    expect(edited.amount).toBe(502.5)

    // Confirm the edited investment pending movement and verify transaction
    expect(store.confirmPending('pm-exp')).toBe(true)
    expect(financialStore.transactions).toHaveLength(1)
    expect(financialStore.transactions[0]).toMatchObject({
      type: 'investment',
      accountId: 'broker-crypto',
      category: 'Cripto',
      symbol: 'BTC',
      units: 0.01,
      unitPrice: 50000,
      fee: 2.5,
      amount: 502.5,
    })

    vi.unstubAllGlobals()
  })
  it('edita una regla sin modificar pendientes ya generados y aplica cambios al siguiente vencimiento', () => {
    setActivePinia(createPinia())
    vi.stubGlobal('window', { __FINANCE_TODAY__: '2024-01-15' })
    const financialStore = useFinancialStateStore()
    financialStore.replaceState({
      year: 2024, currency: 'EUR', accounts: [{ id: 'broker', name: 'Broker', openingBalance: 0 }],
      investmentAssets: [], liabilities: [], incomeCategories: [], expenseCategories: [], investmentCategories: ['Fondos'],
      transactions: [], snapshots: {}, budget: { income: {}, expense: {}, investment: {} }, goals: {}, contributions: [],
      recurringRules: [], pendingMovements: [], instruments: [], quotes: {},
    })
    const store = useRecurringStore()
    expect(store.addRule({
      type: 'investment', accountId: 'broker', category: 'Fondos', description: 'Aporte original', amount: 100,
      symbol: 'VWCE', side: 'buy', units: 1, unitPrice: 100, fee: 0,
      frequency: 'monthly', interval: 1, startDate: '2024-01-01',
    })).toBe(true)
    expect(store.pendingCount).toBe(1)
    const firstPending = store.openPendingMovements[0]
    const ruleId = store.rules[0].id

    expect(store.updateRule(ruleId, {
      type: 'investment', accountId: 'broker', category: 'Fondos', description: 'Aporte actualizado', amount: 210,
      symbol: 'VWCE', side: 'buy', units: 2, unitPrice: 105, fee: 0,
      frequency: 'monthly', interval: 1, startDate: '2024-01-01',
    })).toBe(true)
    expect(store.openPendingMovements[0]).toMatchObject({ id: firstPending.id, description: 'Aporte original', amount: 100, units: 1, unitPrice: 100 })
    expect(store.rules[0]).toMatchObject({ description: 'Aporte actualizado', amount: 210, units: 2, unitPrice: 105, nextOccurrenceDate: '2024-02-01' })

    store.refreshPending('2024-02-02')
    expect(store.openPendingMovements).toHaveLength(2)
    expect(store.openPendingMovements[1]).toMatchObject({ description: 'Aporte actualizado', amount: 210, units: 2, unitPrice: 105, occurrenceDate: '2024-02-01' })
    vi.unstubAllGlobals()
  })

  it('sincroniza una inversión recurrente con Stock Events al confirmarla', async () => {
    setActivePinia(createPinia())
    vi.stubGlobal('window', { __FINANCE_TODAY__: '2024-02-20' })
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({ transaction: { id: 'se-tx-1', watchlistId: 'wl-1', symbol: 'VWCE' } }),
          {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('document', { getElementById: () => null })
    try {
      const financialStore = useFinancialStateStore()
      financialStore.replaceState({
        year: 2024,
        currency: 'EUR',
        accounts: [{ id: 'broker', name: 'Broker', openingBalance: 0 }],
        investmentAssets: [],
        liabilities: [],
        incomeCategories: [],
        expenseCategories: [],
        investmentCategories: ['Fondos Indexados'],
        transactions: [],
        snapshots: {},
        budget: { income: {}, expense: {}, investment: {} },
        goals: {},
        contributions: [],
        recurringRules: [],
        pendingMovements: [],
        instruments: [],
        quotes: {},
        stockEvents: {
          enabled: true,
          apiKey: 'se_live_key',
          symbolMappings: [
            { symbol: 'VWCE', sync: true, watchlistId: 'wl-1', targetSymbol: '', hidden: false },
          ],
        },
      })

      const store = useRecurringStore()
      expect(
        store.addRule({
          type: 'investment',
          accountId: 'broker',
          category: 'Fondos Indexados',
          description: 'Aportación VWCE',
          amount: 100,
          symbol: 'VWCE',
          side: 'buy',
          units: 1,
          unitPrice: 100,
          fee: 1.5,
          time: '09:00',
          frequency: 'monthly',
          interval: 1,
          startDate: '2024-02-01',
        }),
      ).toBe(true)
      store.refreshPending('2024-02-20')
      const pendingId = store.openPendingMovements[0]?.id
      expect(pendingId).toBeTruthy()
      expect(store.confirmPending(pendingId as string)).toBe(true)

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/stockevents/transactions')
      const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
        transaction?: Record<string, unknown>
      }
      expect(requestBody.transaction).toMatchObject({
        watchlistId: 'wl-1',
        symbol: 'VWCE',
        date: '2024-02-01T09:00:00Z',
        change: 1,
        price: 100,
        priceCurrency: 'EUR',
        feesAmount: 1.5,
        feesCurrency: 'EUR',
        type: 'buy',
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
describe('valoración de cartera', () => {
  it('enlaza movimientos existentes al instrumento configurado', () => {
    setActivePinia(createPinia())
    const financialStore = useFinancialStateStore()
    financialStore.replaceState({
      year: 2024, currency: 'EUR', accounts: [{ id: 'broker', name: 'Broker', openingBalance: 0 }],
      investmentAssets: [{ id: 'fund', name: 'Fondo', openingBalance: 0 }], liabilities: [],
      incomeCategories: [], expenseCategories: [], investmentCategories: ['Fondo'],
      transactions: [{ id: 'old-buy', date: '2024-01-01', month: 0, type: 'investment', accountId: 'broker', category: 'Fondo', description: 'Compra antigua', amount: 200, symbol: 'VWCE', side: 'buy', units: 2, unitPrice: 100 }],
      snapshots: {}, budget: { income: {}, expense: {}, investment: {} }, goals: {}, contributions: [],
      recurringRules: [], pendingMovements: [], instruments: [], quotes: {},
    })
    const marketStore = useMarketStore()
    expect(marketStore.addInstrument({ investmentAssetId: 'fund', type: 'etf', symbol: 'VWCE', market: 'XETRA', currency: 'EUR', provider: 'twelve-data' })).toBe(true)
    const instrumentId = marketStore.instruments[0].id
    expect(marketStore.matchingMovementCount(instrumentId)).toBe(1)
    financialStore.commitState((draft) => {
      const instrument = draft.instruments.find((item) => item.id === instrumentId)
      if (instrument) {
        instrument.holdingUnits = 0
        instrument.holdingsAsOf = '2026-07-10'
        instrument.holdingsUpdatedAt = '2026-07-10T10:00:00.000Z'
      }
    })
    expect(marketStore.linkExistingMovements(instrumentId)).toBe(1)
    expect(financialStore.transactions[0].instrumentId).toBe(instrumentId)
    expect(marketStore.linkedMovementCount(instrumentId)).toBe(1)
    expect(marketStore.valuation.instruments[0].units).toBe(2)
    marketStore.updateCurrentUnits(instrumentId, 3)
    expect(marketStore.valuation.instruments[0].units).toBe(3)
    financialStore.commitState((draft) => {
      draft.transactions.push({
        id: 'future-buy', date: '2026-07-11', month: 6, type: 'investment', accountId: 'broker',
        category: 'Fondo', description: 'Compra posterior', amount: 200, symbol: 'VWCE',
        instrumentId, side: 'buy', units: 2, unitPrice: 100, createdAt: new Date(Date.now() + 1_000).toISOString(),
      })
    })
    expect(marketStore.valuation.instruments[0].units).toBe(5)
  })

  it('corrige snapshots antiguos cuando los movimientos ya estaban enlazados', () => {
    const financialStore = useFinancialStateStore()
    financialStore.replaceState({
      year: 2024, currency: 'EUR', accounts: [{ id: 'broker', name: 'Broker', openingBalance: 0 }],
      investmentAssets: [{ id: 'crypto', name: 'Crypto', openingBalance: 0 }], liabilities: [],
      incomeCategories: [], expenseCategories: [], investmentCategories: ['Crypto'],
      transactions: [{ id: 'eth-buy', date: '2024-01-01', month: 0, type: 'investment', accountId: 'broker', category: 'Crypto', description: 'Compra ETH', amount: 2000, symbol: 'ETH', instrumentId: 'crypto-eth', side: 'buy', units: 1, unitPrice: 2000 }],
      snapshots: {}, budget: { income: {}, expense: {}, investment: {} }, goals: {}, contributions: [],
      recurringRules: [], pendingMovements: [],
      instruments: [{ id: 'crypto-eth', investmentAssetId: 'crypto', type: 'crypto', symbol: 'ETH', market: '', currency: 'EUR', provider: 'coingecko', active: true, holdingUnits: 0, holdingsAsOf: '2026-07-10', holdingsUpdatedAt: '2026-07-10T10:00:00.000Z' }],
      quotes: {},
    })
    const marketStore = useMarketStore()
    expect(marketStore.valuation.instruments[0].units).toBe(1)
  })

  it('enlaza AGED con AGED.MI y suma sus títulos', () => {
    const financialStore = useFinancialStateStore()
    financialStore.replaceState({
      year: 2024, currency: 'EUR', accounts: [{ id: 'broker', name: 'Broker', openingBalance: 0 }],
      investmentAssets: [{ id: 'aged', name: 'ETF AGED', openingBalance: 0 }], liabilities: [],
      incomeCategories: [], expenseCategories: [], investmentCategories: ['ETF AGED'],
      transactions: [{
        id: 'aged-buy', date: '2024-01-01', month: 0, type: 'investment', accountId: 'broker',
        category: 'ETF AGED', description: 'Compra AGED', amount: 45, symbol: 'AGED', side: 'buy', units: 5,
      }],
      snapshots: {}, budget: { income: {}, expense: {}, investment: {} }, goals: {}, contributions: [],
      recurringRules: [], pendingMovements: [],
      instruments: [{
        id: 'aged-mi', investmentAssetId: 'aged', type: 'etf', symbol: 'AGED.MI', market: '',
        currency: 'EUR', provider: 'yahoo', active: true,
      }],
      quotes: {},
    })

    const marketStore = useMarketStore()
    expect(marketStore.matchingMovementCount('aged-mi')).toBe(1)
    expect(marketStore.linkExistingMovements('aged-mi')).toBe(1)
    expect(marketStore.valuation.instruments[0].units).toBe(5)
  })

  it('enlaza movimientos legacy sin símbolo por la categoría del activo', () => {
    const financialStore = useFinancialStateStore()
    financialStore.replaceState({
      year: 2024, currency: 'EUR', accounts: [{ id: 'broker', name: 'Broker', openingBalance: 0 }],
      investmentAssets: [{ id: 'aged', name: 'ETF AGED', openingBalance: 0 }], liabilities: [],
      incomeCategories: [], expenseCategories: [], investmentCategories: ['ETF AGED'],
      transactions: [{
        id: 'legacy-aged', date: '2024-01-01', month: 0, type: 'investment', accountId: 'broker',
        category: 'ETF AGED', description: '', amount: 41.4,
      }],
      snapshots: {}, budget: { income: {}, expense: {}, investment: {} }, goals: {}, contributions: [],
      recurringRules: [], pendingMovements: [],
      instruments: [{
        id: 'aged-mi-legacy', investmentAssetId: 'aged', type: 'etf', symbol: 'AGED.MI', market: '',
        currency: 'EUR', provider: 'yahoo', active: true,
      }],
      quotes: {},
    })

    const marketStore = useMarketStore()
    expect(marketStore.matchingMovementCount('aged-mi-legacy')).toBe(1)
    expect(marketStore.linkExistingMovements('aged-mi-legacy')).toBe(1)
    expect(financialStore.transactions[0].instrumentId).toBe('aged-mi-legacy')
  })

  it('suma títulos, convierte moneda y marca cotizaciones antiguas', () => {
    const valuation = buildPortfolioValuation({
      currency: 'EUR',
      instruments: [{ id: 'btc', investmentAssetId: 'crypto', type: 'crypto', symbol: 'BTC', market: '', currency: 'USD', provider: 'coingecko', active: true }],
      quotes: { btc: { instrumentId: 'btc', price: 50_000, currency: 'USD', timestamp: '2024-01-01T00:00:00Z', source: 'mock', status: 'fresh', isStale: false, previousClose: 49_000, changePercent: 2.04 } },
      transactions: [
        { id: 'buy', date: '2024-01-01', month: 0, type: 'investment', accountId: 'broker', category: 'Crypto', description: 'Compra', amount: 1000, symbol: 'BTC', side: 'buy', units: 0.1 },
        { id: 'sell', date: '2024-01-02', month: 0, type: 'investment', accountId: 'broker', category: 'Crypto', description: 'Venta', amount: -100, symbol: 'BTC', side: 'sell', units: 0.02 },
      ],
    }, { now: new Date('2024-01-02T00:00:00Z'), fxRates: { 'USD/EUR': 0.9 } })
    expect(valuation.instruments[0].units).toBe(0.08)
    expect(valuation.totalValue).toBe(3600)
    expect(valuation.instruments[0].isStale).toBe(true)
    expect(valuation.dailyChangePercent).toBe(2.04)
  })
})
