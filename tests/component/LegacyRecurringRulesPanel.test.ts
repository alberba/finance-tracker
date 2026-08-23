import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import LegacyRecurringRulesPanel from '../../src/components/recurring/LegacyRecurringRulesPanel.vue'
import { useFinancialStateStore } from '../../src/stores/financial-state'

describe('LegacyRecurringRulesPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('muestra y permite pausar reglas no inversoras sin mezclar compras', async () => {
    const financialStateStore = useFinancialStateStore()
    const accountId = financialStateStore.accounts[0]?.id ?? 'account'
    financialStateStore.commitState((draft) => {
      draft.recurringRules = [
        {
          id: 'expense-rule',
          type: 'expense',
          accountId,
          category: draft.expenseCategories[0] ?? 'Vivienda',
          description: 'Alquiler histórico',
          amount: 900,
          frequency: 'monthly',
          interval: 1,
          startDate: '2026-01-01',
          endDate: null,
          active: true,
          lastExecutionDate: null,
          nextOccurrenceDate: '2026-09-01',
        },
        {
          id: 'investment-rule',
          type: 'investment',
          accountId,
          category: 'Inversión',
          description: 'Compra indexada',
          amount: 100,
          frequency: 'monthly',
          interval: 1,
          startDate: '2026-01-01',
          endDate: null,
          active: true,
          lastExecutionDate: null,
          nextOccurrenceDate: '2026-09-01',
        },
      ]
    })

    const wrapper = mount(LegacyRecurringRulesPanel)

    expect(wrapper.text()).toContain('Alquiler histórico')
    expect(wrapper.text()).not.toContain('Compra indexada')

    await wrapper.get('article button.secondary-btn').trigger('click')
    expect(wrapper.get('input[required]').element).toBeDefined()
    expect(wrapper.text()).toContain('Cancelar edición')
    await wrapper.get('form button.secondary-btn').trigger('click')
    expect(wrapper.text()).not.toContain('Cancelar edición')

    await wrapper.get('article input[type="checkbox"]').setValue(false)
    expect(financialStateStore.recurringRules[0]?.active).toBe(false)
  })
})
