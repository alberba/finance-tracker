import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import { isReadOnlyDemoActive } from '../../../lib/client/demo-source'
import { useFinancialStateStore } from '../../../stores/financial-state'
import { syncSettingsUpdate } from '../../../lib/client/command-mapping'

import { defaultLayout } from './default-layout'
import {
  absentWidgets,
  normalizeLayout,
  addItem,
  removeItem,
  sameItems,
  settle,
  type DashboardLayout,
  type LayoutItem,
} from './engine'
import { WIDGET_IDS, WIDGETS, type WidgetId } from './widgets'

/**
 * The home's layout and its edit mode (DESIGN.md, «Inicio en escritorio»). A
 * store, not component state, so it survives leaving the section. The layout
 * is stored as a sync-v2 user preference in the shared financial snapshot.
 *
 * While a widget is dragged or resized the grid shows `preview`; nothing is
 * kept until the gesture ends and `commit` settles it.
 */
export const useDashboardLayoutStore = defineStore('neon-dashboard-layout', () => {
  const financialState = useFinancialStateStore()
  const demo = isReadOnlyDemoActive()
  const demoLayout = shallowRef<DashboardLayout | null>(null)
  const layout = computed(
    () =>
      normalizeLayout(demo ? demoLayout.value : financialState.state.dashboardLayout) ??
      defaultLayout(),
  )

  function saveLayout(next: DashboardLayout | null): void {
    if (demo) {
      demoLayout.value = next
      return
    }
    financialState.commitState((draft) => {
      draft.dashboardLayout = next
    })
    void syncSettingsUpdate({ dashboardLayout: next })
  }
  const editing = shallowRef(false)
  const catalogOpen = shallowRef(true)
  const preview = shallowRef<LayoutItem[] | null>(null)
  /** The widget being dragged or resized right now. */
  const activeId = shallowRef<WidgetId | null>(null)
  /** What a screen reader hears about the last change. */
  const announcement = shallowRef('')
  /** A widget being dragged in from the catalog while it is not over the grid yet: its name and where the pointer is. */
  const ghost = shallowRef<{ id: WidgetId; x: number; y: number } | null>(null)

  /** What the grid draws: the gesture's preview, or what is kept. */
  const items = computed(() => preview.value ?? layout.value.items)
  const absent = computed(() => absentWidgets(layout.value.items, WIDGET_IDS))
  const isDefault = computed(() => sameItems(layout.value.items, defaultLayout().items))

  function setEditing(value: boolean): void {
    editing.value = value
    preview.value = null
    activeId.value = null
    ghost.value = null
    if (value) catalogOpen.value = true
    announcement.value = value
      ? 'Editando el inicio. Arrastra los widgets o usa las flechas para moverlos.'
      : 'Edición terminada.'
  }

  function setPreview(next: LayoutItem[] | null, id: WidgetId | null = activeId.value): void {
    preview.value = next
    activeId.value = next ? id : null
  }

  /** Keeps `next` (settled) as the layout and ends the gesture. */
  function commit(next: readonly LayoutItem[], message = ''): void {
    const settled = settle(next)
    if (!sameItems(settled, layout.value.items)) {
      saveLayout({ version: 1, items: settled })
    }
    preview.value = null
    activeId.value = null
    ghost.value = null
    if (message) announcement.value = message
  }

  function remove(id: WidgetId): void {
    commit(removeItem(layout.value.items, id), `${WIDGETS[id].title} quitado del inicio.`)
  }

  function add(id: WidgetId): void {
    commit(addItem(layout.value.items, id), `${WIDGETS[id].title} añadido al inicio.`)
  }

  function reset(): void {
    saveLayout(null)
    preview.value = null
    activeId.value = null
    announcement.value = 'Distribución restablecida.'
  }

  return {
    layout,
    editing,
    catalogOpen,
    preview,
    activeId,
    announcement,
    ghost,
    items,
    absent,
    isDefault,
    setEditing,
    setPreview,
    commit,
    remove,
    add,
    reset,
  }
})
