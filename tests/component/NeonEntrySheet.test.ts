import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useEntrySheet } from '../../src/composables/useEntrySheet'
import NeonEntrySheet from '../../src/neon/entry/NeonEntrySheet.vue'
import { useFinancialStateStore } from '../../src/stores/financial-state'

const showToast = vi.hoisted(() => vi.fn())
vi.mock('../../src/scripts/toast', () => ({ showToast }))
vi.mock('../../src/lib/client/movement-commands', () => ({ syncMovements: vi.fn() }))

let pinia: Pinia
const wrappers: { unmount(): void }[] = []

beforeEach(() => {
  showToast.mockClear()
  pinia = createPinia()
  setActivePinia(pinia)
  useFinancialStateStore().patchState((draft) => {
    draft.accounts = [
      { id: 'corriente', name: 'Corriente', openingBalance: 0 },
      { id: 'hucha', name: 'Hucha', openingBalance: 0 },
    ]
    draft.expenseCategories = ['Comida']
    draft.incomeCategories = ['Nómina']
    draft.savingCategories = ['Fondo de emergencia']
    draft.investmentCategories = ['Fondos']
    draft.transactions = []
  })
})
afterEach(() => {
  useEntrySheet().closeEntrySheet()
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
})

async function openSheet() {
  const wrapper = mount(NeonEntrySheet, { attachTo: document.body, global: { plugins: [pinia] } })
  wrappers.push(wrapper)
  useEntrySheet().openEntrySheet()
  await nextTick()
  await nextTick()
  return wrapper
}

const transactions = () => useFinancialStateStore().transactions

describe('NeonEntrySheet', () => {
  it('opens as a modal dialog from the shared flag', async () => {
    const wrapper = await openSheet()
    expect((wrapper.get('dialog').element as HTMLDialogElement).open).toBe(true)
  })

  it.each([
    ['expense', 'Comida'],
    ['income', 'Nómina'],
    ['saving', 'Fondo de emergencia'],
    ['investment', 'Fondos'],
  ] as const)('saves a %s', async (type, category) => {
    const wrapper = await openSheet()
    await wrapper.get(`[data-entry-type="${type}"]`).trigger('click')
    await wrapper.get('[name="amount"]').setValue('12,5')
    await wrapper.get('form').trigger('submit')

    expect(transactions()).toHaveLength(1)
    expect(transactions()[0]).toMatchObject({ type, category, amount: 12.5 })
    expect(useEntrySheet().open.value).toBe(false)
  })

  it('rejects a zero amount with the same message as the old panel', async () => {
    const wrapper = await openSheet()
    await wrapper.get('form').trigger('submit')

    expect(showToast).toHaveBeenCalledWith('El importe debe ser mayor que 0.')
    expect(transactions()).toHaveLength(0)
    expect(useEntrySheet().open.value).toBe(true)
  })

  it('never offers the origin account as destination of a saving', async () => {
    const wrapper = await openSheet()
    await wrapper.get('[data-entry-type="saving"]').trigger('click')

    const options = wrapper
      .get('[name="destinationAccountId"]')
      .findAll('option')
      .map((option) => option.element.value)
    expect(options).toEqual(['hucha'])
  })

  it('saves nothing on cancel and reopens empty', async () => {
    const wrapper = await openSheet()
    await wrapper.get('[data-entry-type="income"]').trigger('click')
    await wrapper.get('[name="amount"]').setValue('50')
    await wrapper.get('[name="description"]').setValue('Algo')
    const cancel = wrapper.findAll('button').find((button) => button.text() === 'Cancelar')!
    await cancel.trigger('click')
    await nextTick()
    await nextTick()

    expect(transactions()).toHaveLength(0)

    useEntrySheet().openEntrySheet()
    await nextTick()
    await nextTick()
    await nextTick()
    expect((wrapper.get('[name="amount"]').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('[name="description"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.get('[data-entry-type="expense"]').attributes('aria-checked')).toBe('true')
  })
})
