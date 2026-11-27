import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useUiStore } from '../../src/stores/ui'
import {
  NO_EXTRA_FILTERS,
  type ExtraFilters,
} from '../../src/neon/sections/transactions/registry-view-model'

const accounts = vi.hoisted(() => ({ list: [] as Array<{ id: string; name: string }> }))

vi.mock('../../src/stores/movements', () => ({
  useMovementsStore: () => ({
    get accounts() {
      return accounts.list
    },
  }),
}))
// The view transition is covered on its own; here every change applies at once.
vi.mock('../../src/neon/sections/transactions/ledger-swap', () => ({
  swapLedger: (update: () => void) => update(),
}))

import { useRegistryFilters } from '../../src/neon/sections/transactions/registry-filters'

function setup(extra: ExtraFilters = { ...NO_EXTRA_FILTERS }) {
  const extraRef = ref<ExtraFilters>(extra)
  return { extra: extraRef, filters: useRegistryFilters(extraRef) }
}

describe('useRegistryFilters', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    accounts.list = [
      { id: 'a1', name: 'Nómina' },
      { id: 'a2', name: 'Ahorro' },
    ]
  })

  it('ofrece «Todos» y un chip por tipo', () => {
    const { typeOptions } = setup().filters
    expect(typeOptions.map((option) => option.value)).toEqual([
      '',
      'expense',
      'income',
      'saving',
      'investment',
    ])
    expect(typeOptions[0].label).toBe('Todos')
  })

  it('sin tipo elegido son todos, y con un tipo muestra su nombre', () => {
    const { filters } = setup()
    expect(filters.type.value).toBe('')
    expect(filters.typeLabel.value).toBe('Todos')

    filters.setType('saving')
    expect(useUiStore().ui.txFilters.types).toEqual(['saving'])
    expect(filters.type.value).toBe('saving')
    expect(filters.typeLabel.value).toBe('Ahorros')

    filters.setType('')
    expect(useUiStore().ui.txFilters.types).toEqual([])
    expect(filters.typeLabel.value).toBe('Todos')
  })

  it('varios tipos a la vez cuentan como ninguno elegido', () => {
    const { filters } = setup()
    useUiStore().ui.txFilters.types = ['expense', 'income']
    expect(filters.type.value).toBe('')
  })

  it('lista las cuentas tras «Todas» y sigue los cambios del store', () => {
    const { filters } = setup()
    expect(filters.accountOptions.value).toEqual([
      { value: '', label: 'Todas' },
      { value: 'a1', label: 'Nómina' },
      { value: 'a2', label: 'Ahorro' },
    ])
    expect(filters.account.value).toBe('')
    expect(filters.accountLabel.value).toBe('Todas')

    filters.setAccount('a2')
    expect(useUiStore().ui.txFilters.accountIds).toEqual(['a2'])
    expect(filters.account.value).toBe('a2')
    expect(filters.accountLabel.value).toBe('Ahorro')

    filters.setAccount('')
    expect(useUiStore().ui.txFilters.accountIds).toEqual([])
  })

  it('una cuenta que ya no existe se rotula «Todas»', () => {
    const { filters } = setup()
    filters.setAccount('borrada')
    expect(filters.accountLabel.value).toBe('Todas')
  })
})
