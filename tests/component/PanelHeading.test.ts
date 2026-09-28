import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PanelHeading from '../../src/components/ui/PanelHeading.vue'

describe('PanelHeading', () => {
  it('muestra el antetítulo, el título como encabezado y la entradilla', () => {
    const wrapper = mount(PanelHeading, {
      props: { kicker: 'Mercado', description: 'Precio orientativo.' },
      slots: { default: 'Cartera a precio de mercado' },
    })

    const paragraphs = wrapper.findAll('p').map((p) => p.text())
    expect(paragraphs).toEqual(['Mercado', 'Precio orientativo.'])
    expect(wrapper.get('h3').text()).toBe('Cartera a precio de mercado')
  })

  it('admite marcado dentro del título', () => {
    const wrapper = mount(PanelHeading, {
      props: { kicker: 'Revisión explícita' },
      slots: { default: 'Pendientes <span data-count>(3)</span>' },
    })

    expect(wrapper.get('h3 [data-count]').text()).toBe('(3)')
  })

  it('omite la entradilla cuando no la hay', () => {
    const wrapper = mount(PanelHeading, {
      props: { kicker: 'Mercado' },
      slots: { default: 'Título' },
    })

    expect(wrapper.findAll('p').map((p) => p.text())).toEqual(['Mercado'])
  })
})
