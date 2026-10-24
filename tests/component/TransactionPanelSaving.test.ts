import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import TransactionPanel from '../../src/components/transactions/TransactionPanel.vue'
import { useFinancialStateStore } from '../../src/stores/financial-state'

vi.mock('../../src/composables/useSetupNavigation', () => ({
  useSetupNavigation: () => ({ createAccount: vi.fn(), editCategories: vi.fn() }),
}))
vi.mock('../../src/lib/client/movement-commands', () => ({ syncMovements: vi.fn() }))

let pinia: Pinia
const wrappers: { unmount(): void }[] = []

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  useFinancialStateStore().patchState((draft) => {
    draft.accounts = [
      { id: 'corriente', name: 'Corriente', openingBalance: 0 },
      { id: 'hucha', name: 'Hucha', openingBalance: 0 },
    ]
    draft.savingCategories = ['Fondo de emergencia']
    draft.expenseCategories = ['Comida']
    draft.transactions = []
  })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
})

async function openPanel() {
  const wrapper = mount(TransactionPanel, { attachTo: document.body, global: { plugins: [pinia] } })
  wrappers.push(wrapper)
  wrapper.vm.openNew()
  await nextTick()
  await nextTick()
  return wrapper
}

async function chooseSaving(wrapper: Awaited<ReturnType<typeof openPanel>>) {
  await wrapper.get('[data-tx-type="saving"]').trigger('click')
}

describe('TransactionPanel saving', () => {
  it('shows origin and destination only for a saving', async () => {
    const wrapper = await openPanel()
    expect(wrapper.find('[name="destinationAccountId"]').exists()).toBe(false)

    await chooseSaving(wrapper)

    expect(wrapper.find('[name="destinationAccountId"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Cuenta origen')
    expect(wrapper.text()).toContain('Cuenta destino')
  })

  it('never offers the origin as destination', async () => {
    const wrapper = await openPanel()
    await chooseSaving(wrapper)

    const destination = wrapper.get('[name="destinationAccountId"]')
    const origin = (wrapper.get('[name="accountId"]').element as HTMLSelectElement).value
    const values = destination.findAll('option').map((option) => option.element.value)

    expect(values).not.toContain(origin)
    expect(values).toHaveLength(1)
  })

  it('saves a saving with its destination and leaves the net out of the preview', async () => {
    const wrapper = await openPanel()
    await chooseSaving(wrapper)
    await wrapper.get('[name="amount"]').setValue('150')

    expect(wrapper.get('[data-tx-preview]').text()).not.toMatch(/[+−-]/)

    await wrapper.get('form').trigger('submit')

    const [saved] = useFinancialStateStore().transactions
    expect(saved).toMatchObject({
      type: 'saving',
      accountId: 'corriente',
      destinationAccountId: 'hucha',
      category: 'Fondo de emergencia',
      amount: 150,
    })
  })
})
