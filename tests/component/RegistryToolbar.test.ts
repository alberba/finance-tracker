import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import RegistryToolbar from '../../src/components/transactions/RegistryToolbar.vue'
import { useUiStore } from '../../src/stores/ui'
import type { TransactionType } from '../../src/scripts/types'

const CHIP_TYPES: TransactionType[] = ['income', 'expense', 'saving', 'investment']

describe('RegistryToolbar exportar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('ofrece «Exportar» y pide abrir el informe al pulsarlo', async () => {
    const wrapper = mount(RegistryToolbar)

    await wrapper.get('#tx-export').trigger('click')

    expect(wrapper.get('#tx-export').text()).toBe('Exportar')
    expect(wrapper.emitted('export')).toHaveLength(1)
  })

  it('ya no tiene los filtros de fecha exacta e importe', () => {
    const wrapper = mount(RegistryToolbar)

    expect(wrapper.text()).not.toContain('Importe y fecha')
    expect(wrapper.find('#tx-extra-filters').exists()).toBe(false)
  })
})

describe('RegistryToolbar type chips', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function setup() {
    const wrapper = mount(RegistryToolbar)
    const ui = useUiStore()
    const input = (type: TransactionType) => wrapper.get(`[data-type-chip="${type}"] input`)
    const isOn = (type: TransactionType) => (input(type).element as HTMLInputElement).checked
    const toggle = (type: TransactionType, on: boolean) => input(type).setValue(on)
    return { wrapper, ui, isOn, toggle }
  }

  it('abre con los cuatro chips desactivados y sin tipos elegidos', () => {
    const { ui, isOn } = setup()

    CHIP_TYPES.forEach((type) => expect(isOn(type)).toBe(false))
    expect(ui.ui.txFilters.types).toEqual([])
  })

  it('activa un tipo y luego suma otro, manteniendo ambos chips encendidos', async () => {
    const { ui, isOn, toggle } = setup()

    await toggle('expense', true)
    expect(isOn('expense')).toBe(true)
    expect(isOn('income')).toBe(false)
    expect(ui.ui.txFilters.types).toEqual(['expense'])

    await toggle('investment', true)
    expect(isOn('expense')).toBe(true)
    expect(isOn('investment')).toBe(true)
    expect(isOn('income')).toBe(false)
    expect(ui.ui.txFilters.types).toEqual(['expense', 'investment'])
  })

  it('permite apagar el único chip activo y vuelve a la selección vacía', async () => {
    const { ui, isOn, toggle } = setup()

    await toggle('saving', true)
    await toggle('saving', false)

    expect(isOn('saving')).toBe(false)
    expect(ui.ui.txFilters.types).toEqual([])
  })

  it('mantiene los cuatro chips encendidos cuando se activan todos', async () => {
    const { ui, isOn, toggle } = setup()

    for (const type of CHIP_TYPES) await toggle(type, true)

    CHIP_TYPES.forEach((type) => expect(isOn(type)).toBe(true))
    expect(ui.ui.txFilters.types).toEqual(CHIP_TYPES)
  })
})
