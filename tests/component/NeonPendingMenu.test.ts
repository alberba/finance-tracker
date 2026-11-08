import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import NeonPendingMenu from '../../src/neon/layout/NeonPendingMenu.vue'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useRecurringStore } from '../../src/stores/recurring'

const wrappers: Array<ReturnType<typeof mount>> = []

function pendingMovement(id: string, description: string, amount: number) {
  return {
    id,
    occurrenceKey: `rule-${id}:2026-02-01`,
    ruleId: `rule-${id}`,
    occurrenceDate: '2026-02-01',
    type: 'expense' as const,
    accountId: 'acc-cash',
    category: 'Vivienda',
    description,
    amount,
    status: 'pending' as const,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    transactionId: null,
  }
}

function setup(pending: Array<ReturnType<typeof pendingMovement>>) {
  setActivePinia(createPinia())
  useFinancialStateStore().replaceState({
    year: 2026,
    currency: 'EUR',
    accounts: [{ id: 'acc-cash', name: 'Cuenta Principal', openingBalance: 1000 }],
    investmentAssets: [],
    liabilities: [],
    incomeCategories: ['Nómina'],
    expenseCategories: ['Vivienda'],
    investmentCategories: [],
    transactions: [],
    snapshots: {},
    budget: { income: {}, expense: {}, investment: {} },
    goals: {},
    contributions: [],
    recurringRules: [],
    pendingMovements: pending,
    instruments: [],
    quotes: {},
  } as never)
  const wrapper = mount(NeonPendingMenu, { attachTo: document.body })
  wrappers.push(wrapper)
  return { wrapper, recurringStore: useRecurringStore() }
}

const trigger = (wrapper: ReturnType<typeof mount>) =>
  wrapper.get('button[aria-label^="Por confirmar"]')

async function openMenu(wrapper: ReturnType<typeof mount>) {
  await trigger(wrapper).trigger('click')
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
})

describe('NeonPendingMenu', () => {
  it('sin pendientes abre un popover con el estado vacío', async () => {
    const { wrapper } = setup([])

    expect(trigger(wrapper).attributes('aria-label')).toBe('Por confirmar')
    await openMenu(wrapper)

    expect(wrapper.get('[role="dialog"]').text()).toContain('Todo al día')
    expect(wrapper.find('[data-empty-state]').exists()).toBe(true)
  })

  it('con pendientes cuenta cuántos hay y los lista', async () => {
    const { wrapper } = setup([
      pendingMovement('p1', 'Alquiler', 500),
      pendingMovement('p2', 'Internet', 40),
    ])

    expect(trigger(wrapper).attributes('aria-label')).toBe('Por confirmar, 2 pendientes')
    await openMenu(wrapper)

    const items = wrapper.get('[role="dialog"]').findAll('[data-pending-item]')
    expect(items.map((item) => item.text())).toEqual([
      expect.stringContaining('Alquiler'),
      expect.stringContaining('Internet'),
    ])
    expect(wrapper.find('[data-empty-state]').exists()).toBe(false)
  })

  it('elegir uno cierra el popover y abre su detalle', async () => {
    const { wrapper } = setup([pendingMovement('p1', 'Alquiler', 500)])
    await openMenu(wrapper)

    await wrapper.get('[data-pending-item="p1"] button').trigger('click')
    await nextTick()

    expect(wrapper.find('[role="dialog"][aria-label="Por confirmar"]').exists()).toBe(false)
    const panel = wrapper.get('dialog')
    expect((panel.element as HTMLDialogElement).open).toBe(true)
    expect(panel.text()).toContain('Alquiler')
    expect(panel.text()).toContain('Cuenta Principal')
    expect(panel.text()).toContain('500,00')
  })

  it('confirmar desde el detalle apunta el movimiento y lo quita de la lista', async () => {
    const { wrapper, recurringStore } = setup([pendingMovement('p1', 'Alquiler', 500)])
    await openMenu(wrapper)
    await wrapper.get('[data-pending-item="p1"] button').trigger('click')
    await nextTick()

    await wrapper.get('dialog button[data-pending-confirm]').trigger('click')
    await nextTick()

    expect(recurringStore.openPendingMovements).toHaveLength(0)
    expect(useFinancialStateStore().transactions).toHaveLength(1)
    expect(trigger(wrapper).attributes('aria-label')).toBe('Por confirmar')
  })

  it('saltar desde el detalle descarta el vencimiento sin apuntar nada', async () => {
    const { wrapper, recurringStore } = setup([pendingMovement('p1', 'Alquiler', 500)])
    await openMenu(wrapper)
    await wrapper.get('[data-pending-item="p1"] button').trigger('click')
    await nextTick()

    await wrapper.get('dialog button[data-pending-skip]').trigger('click')
    await nextTick()

    expect(recurringStore.openPendingMovements).toHaveLength(0)
    expect(useFinancialStateStore().transactions).toHaveLength(0)
  })
})
