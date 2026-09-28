import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PageHeader from '../../src/components/ui/PageHeader.vue'

describe('PageHeader', () => {
  it('muestra antetítulo, título como encabezado con su id y entradilla', () => {
    const wrapper = mount(PageHeader, {
      props: { kicker: 'Cartera', title: 'Inversión', titleId: 'investment-title', lede: 'Cómo va.' },
    })

    const heading = wrapper.get('h2')
    expect(heading.text()).toBe('Inversión')
    expect(heading.attributes('id')).toBe('investment-title')
    expect(wrapper.findAll('p').map((p) => p.text())).toEqual(['Cartera', 'Cómo va.'])
  })

  it('pinta el lateral solo cuando se le da contenido', () => {
    const bare = mount(PageHeader, { props: { kicker: 'K', title: 'T', titleId: 't' } })
    const withAside = mount(PageHeader, {
      props: { kicker: 'K', title: 'T', titleId: 't' },
      slots: { aside: '<p data-status>Actualizado</p>' },
    })

    expect(bare.findAll('p')).toHaveLength(1)
    expect(withAside.get('[data-status]').text()).toBe('Actualizado')
  })
})
