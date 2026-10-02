import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import KickerLabel from '../../src/components/ui/KickerLabel.vue'

describe('KickerLabel', () => {
  it('pinta su texto como párrafo por defecto', () => {
    const wrapper = mount(KickerLabel, { slots: { default: 'Registro diario' } })

    expect(wrapper.element.tagName).toBe('P')
    expect(wrapper.text()).toBe('Registro diario')
  })

  it('puede ser el encabezado de un bloque', () => {
    const wrapper = mount(KickerLabel, {
      props: { as: 'h3', tone: 'ink' },
      attrs: { id: 'tx-month-title' },
      slots: { default: 'Neto de septiembre 2026' },
    })

    expect(wrapper.element.tagName).toBe('H3')
    expect(wrapper.attributes('id')).toBe('tx-month-title')
  })
})
