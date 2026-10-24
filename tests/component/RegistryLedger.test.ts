import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import RegistryLedger from '../../src/components/transactions/RegistryLedger.vue'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useUiStore } from '../../src/stores/ui'
import type { Month } from '../../src/lib/month'
import type { Transaction } from '../../src/scripts/types'

describe('RegistryLedger', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function makeTx(overrides: Partial<Transaction>): Transaction {
    return {
      id: 'tx-1',
      date: '2026-10-05',
      month: 10,
      type: 'expense',
      category: 'Vivienda',
      amount: 100,
      description: 'Test tx',
      accountId: 'acc-1',
      ...overrides,
    }
  }

  function setupTransactions(transactions: Transaction[], currentMonth: Month = 10, year = 2026) {
    const financialStore = useFinancialStateStore()
    const uiStore = useUiStore()

    financialStore.replaceState({
      year,
      currency: 'EUR',
      accounts: [{ id: 'acc-1', name: 'Cuenta 1', openingBalance: 1000 }],
      investmentAssets: [],
      liabilities: [],
      incomeCategories: ['Nómina'],
      expenseCategories: ['Vivienda'],
      investmentCategories: [],
      transactions,
      snapshots: {},
      budget: { income: {}, expense: {}, investment: {} },
      goals: {},
      contributions: [],
      recurringRules: [],
      pendingMovements: [],
      instruments: [],
      quotes: {},
    })

    uiStore.ui.txYear = year
    uiStore.ui.txFilterMonth = currentMonth
    uiStore.ui.txFilters = {
      search: '',
      types: [],
      accountIds: [],
      date: '',
      amountMin: '',
      amountMax: '',
    }

    return { financialStore, uiStore }
  }

  it('solo muestra los movimientos del mes actual y pliega los anteriores', () => {
    setupTransactions([
      makeTx({ id: 'tx-oct', date: '2026-10-05', month: 10, description: 'Alquiler octubre' }),
      makeTx({ id: 'tx-sep', date: '2026-09-12', month: 9, description: 'Alquiler septiembre' }),
      makeTx({ id: 'tx-ago', date: '2026-08-10', month: 8, description: 'Alquiler agosto' }),
    ])

    const wrapper = mount(RegistryLedger, {
      props: { selecting: false },
    })

    const groups = wrapper.findAll('tbody')
    expect(groups).toHaveLength(1)
    expect(groups[0].text()).toContain('Octubre 2026')
    expect(wrapper.text()).toContain('Alquiler octubre')
    expect(wrapper.text()).not.toContain('Alquiler septiembre')
    expect(wrapper.text()).not.toContain('Alquiler agosto')

    const button = wrapper.get('[data-tx-show-older]')
    expect(button.text()).toBe('Ver septiembre y anteriores · 2 movimientos')
  })

  it('al pulsar el botón muestra los meses anteriores', async () => {
    setupTransactions([
      makeTx({ id: 'tx-oct', date: '2026-10-05', month: 10, description: 'Alquiler octubre' }),
      makeTx({ id: 'tx-sep', date: '2026-09-12', month: 9, description: 'Alquiler septiembre' }),
    ])

    const wrapper = mount(RegistryLedger, {
      props: { selecting: false },
    })

    expect(wrapper.text()).not.toContain('Alquiler septiembre')

    await wrapper.get('[data-tx-show-older]').trigger('click')

    expect(wrapper.findAll('tbody')).toHaveLength(2)
    expect(wrapper.text()).toContain('Alquiler octubre')
    expect(wrapper.text()).toContain('Alquiler septiembre')
    expect(wrapper.find('[data-tx-show-older]').exists()).toBe(false)
  })

  it('muestra todos los movimientos cuando hay filtros activos', () => {
    const { uiStore } = setupTransactions([
      makeTx({ id: 'tx-oct', date: '2026-10-05', month: 10, description: 'Supermercado oct' }),
      makeTx({ id: 'tx-sep', date: '2026-09-12', month: 9, description: 'Supermercado sep' }),
    ])
    uiStore.ui.txFilters.search = 'Supermercado'

    const wrapper = mount(RegistryLedger, {
      props: { selecting: false },
    })

    expect(wrapper.findAll('tbody')).toHaveLength(2)
    expect(wrapper.text()).toContain('Supermercado oct')
    expect(wrapper.text()).toContain('Supermercado sep')
    expect(wrapper.find('[data-tx-show-older]').exists()).toBe(false)
  })

  it('muestra el último mes con movimientos si el mes seleccionado no tiene', () => {
    setupTransactions(
      [
        makeTx({ id: 'tx-sep', date: '2026-09-12', month: 9, description: 'Nómina septiembre' }),
        makeTx({ id: 'tx-ago', date: '2026-08-10', month: 8, description: 'Nómina agosto' }),
      ],
      10, // Octubre no tiene movimientos
    )

    const wrapper = mount(RegistryLedger, {
      props: { selecting: false },
    })

    const groups = wrapper.findAll('tbody')
    expect(groups).toHaveLength(1)
    expect(groups[0].text()).toContain('Septiembre 2026')
    expect(wrapper.text()).toContain('Nómina septiembre')
    expect(wrapper.text()).not.toContain('Nómina agosto')

    const button = wrapper.get('[data-tx-show-older]')
    expect(button.text()).toBe('Ver agosto y anteriores · 1 movimientos')
  })
})
