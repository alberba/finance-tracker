import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AppSection from '../../src/components/ui/AppSection.vue'

describe('AppSection', () => {
  it('expone una sección activa con su contrato accesible', () => {
    const wrapper = mount(AppSection, {
      props: { id: 'budget', isActive: true },
      slots: { default: '<h2 id="budget-title">Presupuesto</h2>' },
    })

    const section = wrapper.get('section')
    expect(section.attributes('id')).toBe('budget')
    expect(section.attributes('aria-labelledby')).toBe('budget-title')
    expect(section.classes()).toContain('animate-panel-in')
    expect(section.classes()).not.toContain('hidden')
    expect(section.get('h2').text()).toBe('Presupuesto')
  })

  it('oculta la sección cuando deja de estar activa', async () => {
    const wrapper = mount(AppSection, {
      props: { id: 'goals', isActive: true },
    })

    await wrapper.setProps({ isActive: false })

    expect(wrapper.get('section').classes()).toContain('hidden')
    expect(wrapper.get('section').classes()).not.toContain('animate-panel-in')
  })
})
