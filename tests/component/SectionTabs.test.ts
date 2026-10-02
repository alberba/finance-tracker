import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SectionTabs, { type SectionTab } from '../../src/components/ui/SectionTabs.vue'

const tabs: SectionTab[] = [
  { id: 'dashboard', label: 'Resumen' },
  { id: 'movements', label: 'Movimientos', count: 14 },
  { id: 'recurring', label: 'Compras recurrentes', count: 0, buttonId: 'recurring-button' },
]

function mountTabs(active = 'dashboard') {
  return mount(SectionTabs, {
    props: {
      tabs,
      label: 'Subsecciones de inversión',
      panelIdPrefix: 'investment-tab-',
      dataKey: 'investment-tab',
      modelValue: active,
      'onUpdate:modelValue': () => {},
    },
    attachTo: document.body,
  })
}

describe('SectionTabs', () => {
  it('expone una lista de pestañas con su nombre accesible', () => {
    const wrapper = mountTabs()

    const list = wrapper.get('[role="tablist"]')
    expect(list.attributes('aria-label')).toBe('Subsecciones de inversión')
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      'Resumen',
      'Movimientos 14',
      'Compras recurrentes 0',
    ])
  })

  it('marca la pestaña activa y enlaza cada pestaña con su panel', () => {
    const wrapper = mountTabs('movements')

    const [resumen, movements, recurring] = wrapper.findAll('[role="tab"]')
    expect(resumen.attributes('aria-selected')).toBe('false')
    expect(movements.attributes('aria-selected')).toBe('true')
    expect(movements.attributes('aria-controls')).toBe('investment-tab-movements')
    expect(movements.attributes('tabindex')).toBe('0')
    expect(resumen.attributes('tabindex')).toBe('-1')
    expect(recurring.attributes('id')).toBe('recurring-button')
  })

  it('conserva el atributo data-* de cada pestaña', () => {
    const wrapper = mountTabs()

    expect(wrapper.findAll('[data-investment-tab]').map((tab) => tab.attributes('data-investment-tab'))).toEqual(
      ['dashboard', 'movements', 'recurring'],
    )
  })

  it('omite el contador cuando no lo hay', () => {
    const wrapper = mountTabs()

    expect(wrapper.findAll('[role="tab"]')[0].find('[data-tab-count]').exists()).toBe(false)
  })

  it('emite la pestaña pulsada', async () => {
    const wrapper = mountTabs()

    await wrapper.findAll('[role="tab"]')[1].trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['movements']])
  })

  it('se mueve con las flechas, Inicio y Fin, y da la vuelta', async () => {
    const wrapper = mountTabs()
    const list = wrapper.get('[role="tablist"]')

    await list.trigger('keydown', { key: 'ArrowRight' })
    await list.trigger('keydown', { key: 'ArrowLeft' })
    await list.trigger('keydown', { key: 'End' })
    await list.trigger('keydown', { key: 'Home' })
    await list.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('update:modelValue')).toEqual([
      ['movements'],
      ['recurring'],
      ['recurring'],
      ['dashboard'],
    ])
  })
})
