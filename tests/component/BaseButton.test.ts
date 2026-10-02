import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BaseButton from '../../src/components/ui/BaseButton.vue'
import IconButton from '../../src/components/ui/IconButton.vue'

describe('BaseButton', () => {
  it('es un botón de tipo button por defecto que emite click', async () => {
    const wrapper = mount(BaseButton, { slots: { default: 'Guardar' } })

    expect(wrapper.get('button').attributes('type')).toBe('button')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('puede enviar un formulario', () => {
    const wrapper = mount(BaseButton, { props: { type: 'submit' }, slots: { default: 'Guardar' } })

    expect(wrapper.get('button').attributes('type')).toBe('submit')
  })
})

describe('IconButton', () => {
  it('lleva el nombre accesible que se le da y oculta su icono', () => {
    const wrapper = mount(IconButton, {
      props: { label: 'Eliminar Mercadona del 27 sep', icon: 'trash' },
    })

    const button = wrapper.get('button')
    expect(button.attributes('aria-label')).toBe('Eliminar Mercadona del 27 sep')
    expect(button.get('svg').attributes('aria-hidden')).toBe('true')
  })
})
