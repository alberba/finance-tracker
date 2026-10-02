import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DocumentSurface from '../../src/components/ui/DocumentSurface.vue'
import NumberedBlock from '../../src/components/ui/NumberedBlock.vue'

describe('NumberedBlock', () => {
  it('es una sección etiquetada por su título, con número decorativo y descripción', () => {
    const wrapper = mount(NumberedBlock, {
      props: { number: '02', title: 'Posiciones', titleId: 'pos-title', description: 'Peso y valor.' },
      slots: { default: '<table data-body></table>' },
    })

    const section = wrapper.get('section')
    expect(section.attributes('aria-labelledby')).toBe('pos-title')
    expect(wrapper.get('#pos-title').text()).toBe('Posiciones')
    expect(wrapper.get('[aria-hidden="true"]').text()).toBe('02')
    expect(wrapper.text()).toContain('Peso y valor.')
    expect(wrapper.find('[data-body]').exists()).toBe(true)
  })

  it('acepta la descripción y las acciones como slots', () => {
    const wrapper = mount(NumberedBlock, {
      props: { number: '01', title: 'Evolución', titleId: 'evo' },
      slots: {
        description: 'Valor frente a <em>capital</em>.',
        actions: '<button type="button">€</button>',
      },
    })

    expect(wrapper.get('em').text()).toBe('capital')
    expect(wrapper.get('button').text()).toBe('€')
  })

  it('omite la descripción cuando no la hay', () => {
    const wrapper = mount(NumberedBlock, { props: { number: '03', title: 'Cotizaciones', titleId: 'q' } })

    expect(wrapper.find('p').exists()).toBe(false)
  })

  it('la superficie documental agrupa los bloques', () => {
    const wrapper = mount(DocumentSurface, {
      slots: { default: '<section data-a></section><section data-b></section>' },
    })

    expect(wrapper.findAll('section')).toHaveLength(2)
  })
})
