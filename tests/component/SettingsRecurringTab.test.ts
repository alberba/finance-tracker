import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import SettingsRecurringTab from '../../src/components/settings/SettingsRecurringTab.vue'
import type { RecurringRule } from '../../src/scripts/types'
import { useFinancialStateStore } from '../../src/stores/financial-state'

function rule(partial: Partial<RecurringRule> & Pick<RecurringRule, 'id' | 'type'>): RecurringRule {
  return {
    accountId: 'account',
    category: 'Vivienda',
    description: 'Regla',
    amount: 100,
    frequency: 'monthly',
    interval: 1,
    startDate: '2026-01-01',
    endDate: null,
    active: true,
    lastExecutionDate: null,
    nextOccurrenceDate: '2026-09-01',
    ...partial,
  }
}

describe('SettingsRecurringTab', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function seed(): ReturnType<typeof useFinancialStateStore> {
    const store = useFinancialStateStore()
    store.commitState((draft) => {
      draft.recurringRules = [
        rule({ id: 'rent', type: 'expense', description: 'Alquiler histórico', amount: 900 }),
        rule({ id: 'salary', type: 'income', description: 'Nómina', amount: 2000 }),
        rule({ id: 'buy', type: 'investment', description: 'Compra indexada' }),
      ]
    })
    return store
  }

  it('lists the income and expense rules, never the investment ones', () => {
    seed()
    const wrapper = mount(SettingsRecurringTab, { props: { isActive: true } })

    expect(wrapper.text()).toContain('Alquiler histórico')
    expect(wrapper.text()).toContain('Nómina')
    expect(wrapper.text()).not.toContain('Compra indexada')
  })

  it('signs each amount and nets the active rules per month', () => {
    seed()
    const wrapper = mount(SettingsRecurringTab, { props: { isActive: true } })

    const amounts = wrapper
      .findAll('[data-settings-rule-amount]')
      .map((cell) => cell.text().replace(/\s/g, ' '))
    expect(amounts).toEqual(['−900,00 €', '+2.000,00 €'])
    expect(wrapper.get('[data-settings-rules-net]').text().replace(/\s/g, ' ')).toBe(
      '≈ +1.100,00 €',
    )
  })

  it('pauses a rule from its switch', async () => {
    const store = seed()
    const wrapper = mount(SettingsRecurringTab, { props: { isActive: true } })

    await wrapper
      .get('input[role="switch"][aria-label="Regla Alquiler histórico activa"]')
      .setValue(false)

    expect(store.recurringRules.find((item) => item.id === 'rent')?.active).toBe(false)
  })
})
