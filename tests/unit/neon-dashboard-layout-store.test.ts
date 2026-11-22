import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { syncSettingsUpdate } from '../../src/lib/client/command-mapping'
import { useFinancialStateStore } from '../../src/stores/financial-state'

vi.mock('../../src/lib/client/command-mapping', () => ({
  syncSettingsUpdate: vi.fn(async () => {}),
}))

import { defaultLayout } from '../../src/neon/dashboard/layout/default-layout'
import { moveItem } from '../../src/neon/dashboard/layout/engine'
import { useDashboardLayoutStore } from '../../src/neon/dashboard/layout/store'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('dashboard layout store', () => {
  it('starts on the default layout, not editing, with every widget on the home', () => {
    const store = useDashboardLayoutStore()
    expect(store.layout).toEqual(defaultLayout())
    expect(store.editing).toBe(false)
    expect(store.absent).toEqual([])
    expect(store.isDefault).toBe(true)
  })

  it('opens the catalog when edit mode starts and drops any gesture when it ends', () => {
    const store = useDashboardLayoutStore()
    store.catalogOpen = false
    store.setEditing(true)
    expect(store.editing).toBe(true)
    expect(store.catalogOpen).toBe(true)
    store.setPreview(moveItem(store.layout.items, 'goals', 0, 0), 'goals')
    expect(store.activeId).toBe('goals')
    store.setEditing(false)
    expect(store.preview).toBeNull()
    expect(store.activeId).toBeNull()
  })

  it('draws the preview but keeps the layout until the gesture is committed', () => {
    const store = useDashboardLayoutStore()
    const preview = moveItem(store.layout.items, 'goals', 0, 0)
    store.setPreview(preview, 'goals')
    expect(store.items).toBe(preview)
    expect(store.layout).toEqual(defaultLayout())

    store.commit(preview, 'Objetivos: columna 1, fila 1.')
    expect(store.preview).toBeNull()
    expect(store.activeId).toBeNull()
    expect(store.layout.items.find((item) => item.id === 'goals')).toMatchObject({ col: 0, row: 0 })
    expect(store.isDefault).toBe(false)
    expect(store.announcement).toBe('Objetivos: columna 1, fila 1.')
  })

  it('settles what is committed, so nothing is left with an empty row above it', () => {
    const store = useDashboardLayoutStore()
    store.commit(moveItem(store.layout.items, 'wealth', 0, 12))
    const rows = store.layout.items.map((item) => item.row)
    expect(Math.max(...rows)).toBeLessThan(12)
  })

  it('drops a gesture without keeping anything', () => {
    const store = useDashboardLayoutStore()
    store.setPreview(moveItem(store.layout.items, 'goals', 0, 0), 'goals')
    store.setPreview(null)
    expect(store.items).toEqual(store.layout.items)
    expect(store.activeId).toBeNull()
  })

  it('takes a widget off the home, offers it in the catalog and puts it back', () => {
    const store = useDashboardLayoutStore()
    store.remove('recent')
    expect(store.layout.items.some((item) => item.id === 'recent')).toBe(false)
    expect(store.absent).toEqual(['recent'])
    expect(store.announcement).toBe('Movimientos quitado del inicio.')

    store.add('recent')
    expect(store.absent).toEqual([])
    expect(store.layout.items.some((item) => item.id === 'recent')).toBe(true)
    expect(store.announcement).toBe('Movimientos añadido al inicio.')
  })

  it('can empty the home and then go back to the default layout', () => {
    const store = useDashboardLayoutStore()
    for (const item of [...store.layout.items]) store.remove(item.id)
    expect(store.layout.items).toEqual([])
    expect(store.absent).toHaveLength(7)

    store.reset()
    expect(store.layout).toEqual(defaultLayout())
    expect(store.isDefault).toBe(true)
  })
})

describe('dashboard layout persistence', () => {
  it('loads the shared snapshot and reacts to changes from sync', () => {
    const financial = useFinancialStateStore()
    const store = useDashboardLayoutStore()
    financial.commitState((draft) => {
      draft.dashboardLayout = { version: 1, items: [] }
    })
    expect(store.items).toEqual([])
    expect(syncSettingsUpdate).not.toHaveBeenCalled()
    financial.commitState((draft) => {
      draft.dashboardLayout = null
    })
    expect(store.layout).toEqual(defaultLayout())
  })

  it('only persists committed changes, including an empty layout and resetting to defaults', () => {
    const financial = useFinancialStateStore()
    const store = useDashboardLayoutStore()
    store.setPreview([])
    expect(syncSettingsUpdate).not.toHaveBeenCalled()
    store.commit([])
    expect(financial.state.dashboardLayout).toEqual({ version: 1, items: [] })
    expect(syncSettingsUpdate).toHaveBeenLastCalledWith({
      dashboardLayout: { version: 1, items: [] },
    })
    store.commit([])
    expect(syncSettingsUpdate).toHaveBeenCalledTimes(1)
    store.reset()
    expect(financial.state.dashboardLayout).toBeNull()
    expect(syncSettingsUpdate).toHaveBeenLastCalledWith({ dashboardLayout: null })
  })
})
