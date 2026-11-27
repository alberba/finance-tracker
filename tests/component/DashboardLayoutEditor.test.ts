import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import DashboardCatalog from '../../src/neon/dashboard/layout/DashboardCatalog.vue'
import DashboardGrid from '../../src/neon/dashboard/layout/DashboardGrid.vue'
import type { LayoutItem } from '../../src/neon/dashboard/layout/engine'

const wrappers: Array<ReturnType<typeof mount>> = []
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

const items: LayoutItem[] = [
  { id: 'wealth', col: 0, row: 0, w: 3, h: 3 },
  { id: 'goals', col: 3, row: 0, w: 2, h: 3 },
]

function grid(editing: boolean, activeId: LayoutItem['id'] | null = null) {
  const wrapper = mount(DashboardGrid, {
    props: { items, editing, activeId },
    slots: { widget: '<p data-card>{{ params.item.id }}</p>' },
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('DashboardGrid', () => {
  it('draws no edit layer, and keeps the widgets interactive, when not editing', () => {
    const wrapper = grid(false)
    expect(wrapper.find('[data-widget-edit]').exists()).toBe(false)
    expect(wrapper.find('[inert]').exists()).toBe(false)
  })

  it('makes the widget inert and puts a labelled, focusable layer over it while editing', () => {
    const wrapper = grid(true)
    expect(wrapper.find('[data-widget="wealth"] [inert]').exists()).toBe(true)
    const layer = wrapper.get('[data-widget-edit="wealth"]')
    expect(layer.attributes('tabindex')).toBe('0')
    expect(layer.attributes('aria-label')).toContain('Patrimonio')
    expect(layer.attributes('aria-label')).toContain('Flechas')
  })

  it('emits the gestures: move from the layer, resize from the corner, remove from the button', async () => {
    const wrapper = grid(true)
    await wrapper.get('[data-widget-edit="wealth"]').trigger('pointerdown')
    expect(wrapper.emitted('moveStart')?.[0][0]).toMatchObject({ id: 'wealth' })

    await wrapper.get('[data-widget="goals"] [data-widget-resize]').trigger('pointerdown')
    expect(wrapper.emitted('resizeStart')?.[0][0]).toMatchObject({ id: 'goals' })
    // The corner is not also the start of a move.
    expect(wrapper.emitted('moveStart')).toHaveLength(1)

    await wrapper.get('button[aria-label="Quitar Objetivos del inicio"]').trigger('click')
    expect(wrapper.emitted('remove')).toEqual([['goals']])

    await wrapper.get('[data-widget-edit="goals"]').trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('widgetKey')?.[0][0]).toMatchObject({ id: 'goals' })
  })

  it('does not start a move from the remove button', async () => {
    const wrapper = grid(true)
    await wrapper.get('button[aria-label="Quitar Patrimonio del inicio"]').trigger('pointerdown')
    expect(wrapper.emitted('moveStart')).toBeUndefined()
  })
})

describe('DashboardCatalog', () => {
  function catalog(absent: Array<'wealth' | 'recent'>) {
    const wrapper = mount(DashboardCatalog, { props: { absent } })
    wrappers.push(wrapper)
    return wrapper
  }

  it('lists the widgets that are not on the home, with their size, and says «Próximamente»', () => {
    const wrapper = catalog(['wealth', 'recent'])
    expect(wrapper.findAll('[data-catalog-widget]')).toHaveLength(2)
    expect(wrapper.get('[data-catalog-widget="wealth"]').text()).toContain('Patrimonio')
    expect(wrapper.get('[data-catalog-widget="wealth"]').text()).toContain('4 × 2 casillas')
    expect(wrapper.get('[data-catalog-soon]').text()).toBe('Próximamente')
  })

  it('says so when every widget is already on the home', () => {
    const wrapper = catalog([])
    expect(wrapper.find('[data-catalog-widget]').exists()).toBe(false)
    expect(wrapper.get('[data-catalog-empty]').text()).toContain('Todos los widgets')
  })

  it('adds with the button and starts a drag from the tile, but the button does not drag', async () => {
    const wrapper = catalog(['recent'])
    await wrapper.get('button[aria-label="Añadir Movimientos al inicio"]').trigger('pointerdown')
    expect(wrapper.emitted('dragStart')).toBeUndefined()
    await wrapper.get('button[aria-label="Añadir Movimientos al inicio"]').trigger('click')
    expect(wrapper.emitted('add')).toEqual([['recent']])

    await wrapper.get('[data-catalog-widget="recent"]').trigger('pointerdown')
    expect(wrapper.emitted('dragStart')?.[0][0]).toBe('recent')
  })

  it('closes from its button', async () => {
    const wrapper = catalog([])
    await wrapper.get('button[aria-label="Cerrar el panel de widgets"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
