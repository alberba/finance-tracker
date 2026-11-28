import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  await nextTick()
}

/** The open bottom sheet whose title is `title` (the list is «Por confirmar»; a detail, its description). */
function openSheet(wrapper: ReturnType<typeof mount>, title = 'Por confirmar') {
  const sheet = wrapper
    .findAll('dialog')
    .find(
      (dialog) => (dialog.element as HTMLDialogElement).open && dialog.get('h2').text() === title,
    )
  if (!sheet) throw new Error(`No open sheet titled ${title}`)
  return sheet
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
})

describe('NeonPendingMenu', () => {
  it('sin pendientes abre la hoja con el estado vacío', async () => {
    const { wrapper } = setup([])

    expect(trigger(wrapper).attributes('aria-label')).toBe('Por confirmar')
    await openMenu(wrapper)

    expect(openSheet(wrapper).text()).toContain('No queda nada por confirmar')
    expect(openSheet(wrapper).find('[data-empty-state]').exists()).toBe(true)
    expect(openSheet(wrapper).find('[data-pending-confirm-all]').exists()).toBe(false)
  })

  it('con pendientes cuenta cuántos hay y los lista', async () => {
    const { wrapper } = setup([
      pendingMovement('p1', 'Alquiler', 500),
      pendingMovement('p2', 'Internet', 40),
    ])

    expect(trigger(wrapper).attributes('aria-label')).toBe('Por confirmar, 2 pendientes')
    await openMenu(wrapper)

    const items = openSheet(wrapper).findAll('[data-pending-item]')
    expect(items.map((item) => item.text())).toEqual([
      expect.stringContaining('Alquiler'),
      expect.stringContaining('Internet'),
    ])
    expect(wrapper.find('[data-empty-state]').exists()).toBe(false)
  })

  it('confirma uno desde su fila, sin abrir el detalle', async () => {
    const { wrapper, recurringStore } = setup([
      pendingMovement('p1', 'Alquiler', 500),
      pendingMovement('p2', 'Internet', 40),
    ])
    await openMenu(wrapper)

    await openSheet(wrapper).get('button[aria-label="Confirmar Alquiler"]').trigger('click')
    await nextTick()

    expect(recurringStore.openPendingMovements.map((item) => item.description)).toEqual([
      'Internet',
    ])
    expect(openSheet(wrapper).findAll('[data-pending-item]')).toHaveLength(1)
  })

  it('«Confirmar los N» los apunta todos y dice cuánto suman', async () => {
    const { wrapper, recurringStore } = setup([
      pendingMovement('p1', 'Alquiler', 500),
      pendingMovement('p2', 'Internet', 40),
    ])
    await openMenu(wrapper)
    const confirmAll = openSheet(wrapper).get('button[data-pending-confirm-all]')
    expect(confirmAll.text().replace(/\s/g, ' ')).toBe('Confirmar los 2 · −540,00 €')

    await confirmAll.trigger('click')
    await nextTick()

    expect(recurringStore.openPendingMovements).toHaveLength(0)
    expect(useFinancialStateStore().transactions).toHaveLength(2)
    expect(openSheet(wrapper).text()).toContain('No queda nada por confirmar')
  })

  it('elegir uno cierra la hoja y abre su detalle', async () => {
    const { wrapper } = setup([pendingMovement('p1', 'Alquiler', 500)])
    await openMenu(wrapper)

    await wrapper.get('[data-pending-item="p1"] button[aria-label^="Revisar"]').trigger('click')
    await vi.waitFor(() => expect(() => openSheet(wrapper)).toThrow())

    const panel = openSheet(wrapper, 'Alquiler')
    expect(panel.text()).toContain('Cuenta Principal')
    expect(panel.text()).toContain('500,00')
  })

  it('confirmar desde el detalle apunta el movimiento y lo quita de la lista', async () => {
    const { wrapper, recurringStore } = setup([pendingMovement('p1', 'Alquiler', 500)])
    await openMenu(wrapper)
    await wrapper.get('[data-pending-item="p1"] button[aria-label^="Revisar"]').trigger('click')
    await nextTick()

    await openSheet(wrapper, 'Alquiler').get('button[data-pending-confirm]').trigger('click')
    await nextTick()

    expect(recurringStore.openPendingMovements).toHaveLength(0)
    expect(useFinancialStateStore().transactions).toHaveLength(1)
    expect(trigger(wrapper).attributes('aria-label')).toBe('Por confirmar')
  })

  it('saltar desde el detalle descarta el vencimiento sin apuntar nada', async () => {
    const { wrapper, recurringStore } = setup([pendingMovement('p1', 'Alquiler', 500)])
    await openMenu(wrapper)
    await wrapper.get('[data-pending-item="p1"] button[aria-label^="Revisar"]').trigger('click')
    await nextTick()

    await openSheet(wrapper, 'Alquiler').get('button[data-pending-skip]').trigger('click')
    await nextTick()

    expect(recurringStore.openPendingMovements).toHaveLength(0)
    expect(useFinancialStateStore().transactions).toHaveLength(0)
  })

  it('al cerrar el detalle el foco vuelve al botón de «Por confirmar»', async () => {
    const { wrapper } = setup([pendingMovement('p1', 'Alquiler', 500)])
    await openMenu(wrapper)
    await wrapper.get('[data-pending-item="p1"] button[aria-label^="Revisar"]').trigger('click')
    await nextTick()
    const panel = openSheet(wrapper, 'Alquiler')

    await panel.get('button[aria-label="Cerrar"]').trigger('click')
    await vi.waitFor(() => expect((panel.element as HTMLDialogElement).open).toBe(false))

    expect(document.activeElement).toBe(trigger(wrapper).element)
  })
})
