import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import TransactionPanel from '../../src/components/transactions/TransactionPanel.vue'
import { useFinancialStateStore } from '../../src/stores/financial-state'

describe('TransactionPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useFinancialStateStore().replaceState({
      year: 2026,
      currency: 'EUR',
      accounts: [{ id: 'acc-cash', name: 'Cuenta Principal', openingBalance: 1000 }],
      investmentAssets: [],
      liabilities: [],
      incomeCategories: ['Nómina'],
      expenseCategories: ['Restaurante', 'Vivienda'],
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
    })
  })

  function categoryLabels(wrapper: ReturnType<typeof mount>): string[] {
    return wrapper.findAll('select[name="category"] option').map((o) => o.text())
  }

  it('selects the first category of the new type when the type changes', async () => {
    const wrapper = mount(TransactionPanel, { attachTo: document.body })
    ;(wrapper.vm as unknown as { openNew: () => void }).openNew()
    await nextTick()

    const select = () => wrapper.get('select[name="category"]').element as HTMLSelectElement
    expect(select().value).toBe('Restaurante')

    await wrapper.get('[data-tx-type="income"]').trigger('click')
    expect(categoryLabels(wrapper)).toEqual(['Nómina'])
    expect(select().value).toBe('Nómina')

    await wrapper.get('[data-tx-type="investment"]').trigger('click')
    expect(select().value).toBe('Fondos Indexados')
  })
})
