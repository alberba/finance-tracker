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

  it('comparte los filtros de tipo y cuenta con el store de la interfaz', () => {
    const { filters } = setup()
    expect(filters.filters).toBe(useUiStore().ui.txFilters)
  })

  it('ofrece «Todos» y un chip por tipo, con su punto de color', () => {
    const { typeOptions } = setup().filters
    expect(typeOptions.map((option) => option.value)).toEqual([
      '',
      'expense',
      'income',
      'saving',
      'investment',
    ])
    expect(typeOptions[0].label).toBe('Todos')
    expect(typeOptions[0].dot).toBeUndefined()
    expect(typeOptions.find((option) => option.value === 'income')).toMatchObject({
      label: 'Ingresos',
      dot: 'bg-gain',
    })
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

  it('setExtra cambia solo el filtro indicado', () => {
    const { extra, filters } = setup({ ...NO_EXTRA_FILTERS, category: 'Casa' })
    filters.setExtra('min', '12,50')
    expect(extra.value).toEqual({ date: '', min: '12,50', max: '', category: 'Casa' })
  })

  it('clearExtra vacía los filtros indicados y respeta el resto', () => {
    const { extra, filters } = setup({
      date: '2026-11-03',
      min: '5',
      max: '50',
      category: 'Casa',
    })
    filters.clearExtra(['min', 'max'])
    expect(extra.value).toEqual({ date: '2026-11-03', min: '', max: '', category: 'Casa' })
  })
})
