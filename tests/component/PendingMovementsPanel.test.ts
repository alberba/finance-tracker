import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import PendingMovementsPanel from '../../src/components/recurring/PendingMovementsPanel.vue'
import { nextTick } from 'vue'
import { useFinancialStateStore } from '../../src/stores/financial-state'
import { useRecurringStore } from '../../src/stores/recurring'

describe('PendingMovementsPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function setupState() {
    const financialStore = useFinancialStateStore()
    financialStore.replaceState({
      year: 2026,
      currency: 'EUR',
      accounts: [{ id: 'acc-cash', name: 'Cuenta Principal', openingBalance: 1000 }],
      investmentAssets: [{ id: 'asset-broker', name: 'Broker Interactive', openingBalance: 500 }],
      liabilities: [],
      incomeCategories: ['Nómina'],
      expenseCategories: ['Vivienda', 'Suscripciones'],
      investmentCategories: ['Fondos Indexados', 'Cripto'],
      transactions: [],
      snapshots: {},
      budget: { income: {}, expense: {}, investment: {} },
      goals: {},
      contributions: [],
      recurringRules: [],
      pendingMovements: [
        {
          id: 'pm-1',
          occurrenceKey: 'rule-1:2026-02-01',
          ruleId: 'rule-1',
          occurrenceDate: '2026-02-01',
          type: 'expense',
          accountId: 'acc-cash',
          category: 'Vivienda',
          description: 'Gasto mensual',
          amount: 500,
          status: 'pending',
          createdAt: '2026-02-01T00:00:00.000Z',
          updatedAt: '2026-02-01T00:00:00.000Z',
          transactionId: null,
        },
      ],
      instruments: [],
      quotes: {},
    })
    return { financialStore, recurringStore: useRecurringStore() }
  }

  // Editar opens the side panel, where the pending is edited and confirmed.
  async function openEditForm(wrapper: ReturnType<typeof mount>) {
    await wrapper.get('button[aria-label^="Editar"]').trigger('click')
    await nextTick()
    expect((wrapper.get('#pending-edit-panel').element as HTMLDialogElement).open).toBe(true)
    return wrapper.get('#pending-edit-form')
  }

  async function pickType(form: ReturnType<ReturnType<typeof mount>['get']>, type: string) {
    await form.get(`button[data-pending-type="${type}"]`).trigger('click')
  }

  it('renders type control and category select populated with categories of current type', async () => {
    setupState()
    const wrapper = mount(PendingMovementsPanel, { attachTo: document.body })
    const form = await openEditForm(wrapper)

    expect(form.get('button[data-pending-type="expense"]').attributes('aria-pressed')).toBe('true')

    const categorySelect = form.findAll('select').find((s) => s.text().includes('Vivienda'))
    expect(categorySelect).toBeDefined()
    expect(categorySelect?.findAll('option').map((o) => o.text())).toContain('Vivienda')
    expect(categorySelect?.findAll('option').map((o) => o.text())).not.toContain('Fondos Indexados')
  })

  it('shows investment fields and accounts when reclassifying type to investment', async () => {
    setupState()
    const wrapper = mount(PendingMovementsPanel, { attachTo: document.body })
    const form = await openEditForm(wrapper)

    expect(form.text()).not.toContain('Símbolo')

    await pickType(form, 'investment')

    expect(form.text()).toContain('Símbolo')
    expect(form.text()).toContain('Títulos')
    expect(form.text()).toContain('Precio por título')

    const categorySelect = form.findAll('select').find((s) => s.text().includes('Fondos Indexados'))
    expect(categorySelect).toBeDefined()

    const accountSelect = form
      .findAll('select')
      .find((s) => s.text().includes('Broker Interactive'))
    expect(accountSelect).toBeDefined()
  })

  it('saves the edited investment fields into the confirmed movement', async () => {
    const { financialStore, recurringStore } = setupState()
    const wrapper = mount(PendingMovementsPanel, { attachTo: document.body })
    const form = await openEditForm(wrapper)

    await pickType(form, 'investment')

    const categorySelect = form.findAll('select').find((s) => s.text().includes('Fondos Indexados'))
    await categorySelect!.setValue('Fondos Indexados')

    const accountSelect = form
      .findAll('select')
      .find((s) => s.text().includes('Broker Interactive'))
    await accountSelect!.setValue('asset-broker')

    const symbolInput = form.find('input[placeholder="VWCE"]')
    await symbolInput.setValue('VWCE')

    const unitsInput = form
      .findAll<HTMLInputElement>('input[type="number"]')
      .find((i) => i.element.labels?.[0]?.textContent?.includes('Títulos'))
    await unitsInput!.setValue(10)

    const priceInput = form
      .findAll<HTMLInputElement>('input[type="number"]')
      .find((i) => i.element.labels?.[0]?.textContent?.includes('Precio por título'))
    await priceInput!.setValue(100)

    await form.trigger('submit')

    expect(recurringStore.pendingCount).toBe(0)
    expect(financialStore.transactions).toHaveLength(1)
    expect(financialStore.transactions[0]).toMatchObject({
      type: 'investment',
      accountId: 'asset-broker',
      category: 'Fondos Indexados',
      symbol: 'VWCE',
      units: 10,
      unitPrice: 100,
      amount: 1000,
    })
  })

  it('previews the net amount of an investment sale', async () => {
    const { financialStore } = setupState()
    financialStore.commitState((draft) => {
      draft.pendingMovements = [
        {
          id: 'pm-sell',
          occurrenceKey: 'rule-inv:2026-02-01',
          ruleId: 'rule-inv',
          occurrenceDate: '2026-02-01',
          type: 'investment',
          accountId: 'asset-broker',
          category: 'Cripto',
          description: 'Venta Cripto',
          amount: 199,
          symbol: 'ETH',
          side: 'sell',
          units: 2,
          unitPrice: 100,
          fee: 1,
          status: 'pending',
          createdAt: '2026-02-01T00:00:00.000Z',
          updatedAt: '2026-02-01T00:00:00.000Z',
          transactionId: null,
        },
      ]
    })

    const wrapper = mount(PendingMovementsPanel, { attachTo: document.body })
    const form = await openEditForm(wrapper)

    expect(form.text()).toMatch(/199,00\s€/)
    wrapper.unmount()
  })

  it('saves the edit and confirms the pending in a single step', async () => {
    const { financialStore, recurringStore } = setupState()
    financialStore.commitState((draft) => {
      draft.pendingMovements.push({
        id: 'pm-2',
        occurrenceKey: 'rule-2:2026-02-01',
        ruleId: 'rule-2',
        occurrenceDate: '2026-02-01',
        type: 'expense',
        accountId: 'acc-cash',
        category: 'Suscripciones',
        description: 'Otro pendiente',
        amount: 20,
        status: 'pending',
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
        transactionId: null,
      })
    })
    const wrapper = mount(PendingMovementsPanel, { attachTo: document.body })
    const form = await openEditForm(wrapper)
    const descriptionInput = form
      .findAll<HTMLInputElement>('input')
      .find((input) => input.element.labels?.[0]?.textContent?.includes('Descripción'))
    const amountInput = form
      .findAll<HTMLInputElement>('input')
      .find((input) => input.element.labels?.[0]?.textContent?.includes('Importe'))

    await descriptionInput!.setValue('Gasto mensual editado')
    await amountInput!.setValue(450)
    await form.trigger('submit')
    await nextTick()

    expect(recurringStore.pendingCount).toBe(1)
    expect(recurringStore.openPendingMovements[0].id).toBe('pm-2')
    expect(financialStore.transactions).toHaveLength(1)
    expect(financialStore.transactions[0]).toMatchObject({
      description: 'Gasto mensual editado',
      amount: 450,
    })
    expect((wrapper.get('#pending-edit-panel').element as HTMLDialogElement).open).toBe(false)
    wrapper.unmount()
  })

  it('keeps the pending open and unconfirmed when the edit is invalid', async () => {
    const { financialStore, recurringStore } = setupState()
    const wrapper = mount(PendingMovementsPanel, { attachTo: document.body })
    const form = await openEditForm(wrapper)
    const amountInput = form
      .findAll<HTMLInputElement>('input')
      .find((input) => input.element.labels?.[0]?.textContent?.includes('Importe'))

    await amountInput!.setValue(0)
    await form.trigger('submit')
    await nextTick()

    expect((wrapper.get('#pending-edit-panel').element as HTMLDialogElement).open).toBe(true)
    expect(recurringStore.pendingCount).toBe(1)
    expect(recurringStore.openPendingMovements[0]).toMatchObject({
      description: 'Gasto mensual',
      amount: 500,
      status: 'pending',
    })
    expect(financialStore.transactions).toHaveLength(0)
    wrapper.unmount()
  })

  it('leaves the pending untouched when the edit is cancelled', async () => {
    const { financialStore, recurringStore } = setupState()
    const wrapper = mount(PendingMovementsPanel, { attachTo: document.body })
    const form = await openEditForm(wrapper)
    const descriptionInput = form
      .findAll<HTMLInputElement>('input')
      .find((input) => input.element.labels?.[0]?.textContent?.includes('Descripción'))

    await descriptionInput!.setValue('No debería guardarse')
    await wrapper
      .get('#pending-edit-panel')
      .findAll('button')
      .find((button) => button.text() === 'Cancelar edición')!
      .trigger('click')
    await nextTick()

    expect(recurringStore.pendingCount).toBe(1)
    expect(recurringStore.openPendingMovements[0]).toMatchObject({
      description: 'Gasto mensual',
      status: 'pending',
    })
    expect(financialStore.transactions).toHaveLength(0)
    wrapper.unmount()
  })

  it('renders and preserves existing investment pending movement fields on edit', async () => {
    const { financialStore } = setupState()
    financialStore.commitState((draft) => {
      draft.pendingMovements = [
        {
          id: 'pm-inv',
          occurrenceKey: 'rule-inv:2026-02-01',
          ruleId: 'rule-inv',
          occurrenceDate: '2026-02-01',
          type: 'investment',
          accountId: 'asset-broker',
          category: 'Cripto',
          description: 'Aporte Cripto',
          amount: 300,
          symbol: 'ETH',
          side: 'buy',
          units: 0.1,
          unitPrice: 3000,
          fee: 1.5,
          time: '12:00',
          status: 'pending',
          createdAt: '2026-02-01T00:00:00.000Z',
          updatedAt: '2026-02-01T00:00:00.000Z',
          transactionId: null,
        },
      ]
    })

    const wrapper = mount(PendingMovementsPanel, { attachTo: document.body })
    const form = await openEditForm(wrapper)

    const symbolInput = form.find<HTMLInputElement>('input[placeholder="VWCE"]')
    expect(symbolInput.element.value).toBe('ETH')

    const unitsInput = form
      .findAll<HTMLInputElement>('input[type="number"]')
      .find((i) => i.element.labels?.[0]?.textContent?.includes('Títulos'))
    expect(unitsInput?.element.value).toBe('0.1')

    const priceInput = form
      .findAll<HTMLInputElement>('input[type="number"]')
      .find((i) => i.element.labels?.[0]?.textContent?.includes('Precio por título'))
    expect(priceInput?.element.value).toBe('3000')
  })

  it('preserves legacy category without clobbering when opening edit form', async () => {
    const { financialStore, recurringStore } = setupState()
    financialStore.commitState((draft) => {
      draft.pendingMovements = [
        {
          id: 'pm-legacy',
          occurrenceKey: 'rule-1:2026-02-01',
          ruleId: 'rule-1',
          occurrenceDate: '2026-02-01',
          type: 'investment',
          accountId: 'asset-broker',
          category: 'Categoría Antigua Desconocida',
          description: 'Movimiento heredado',
          amount: 100,
          symbol: 'BTC',
          units: 1,
          unitPrice: 100,
          status: 'pending',
          createdAt: '2026-02-01T00:00:00.000Z',
          updatedAt: '2026-02-01T00:00:00.000Z',
          transactionId: null,
        },
      ]
    })

    const wrapper = mount(PendingMovementsPanel, { attachTo: document.body })
    const form = await openEditForm(wrapper)

    const categorySelect = form
      .findAll('select')
      .find((s) => s.text().includes('Categoría Antigua Desconocida'))
    expect(categorySelect).toBeDefined()

    await form.trigger('submit')

    expect(recurringStore.openPendingMovements).toHaveLength(0)
    expect(financialStore.transactions[0].category).toBe('Categoría Antigua Desconocida')
  })

  it('asks before discarding a pending movement', async () => {
    const { recurringStore } = setupState()
    const wrapper = mount(PendingMovementsPanel, { attachTo: document.body })

    await wrapper.get('button[aria-label="Descartar el pendiente Gasto mensual"]').trigger('click')
    await nextTick()

    const dialog = wrapper.get('dialog[role="alertdialog"]')
    expect((dialog.element as HTMLDialogElement).open).toBe(true)
    expect(dialog.text()).toContain('Gasto mensual')
    expect(recurringStore.pendingCount).toBe(1)

    await dialog.get('button[data-confirm]').trigger('click')

    expect(recurringStore.pendingCount).toBe(0)
    expect(recurringStore.pendingMovements[0].status).toBe('cancelled')
    wrapper.unmount()
  })
})
