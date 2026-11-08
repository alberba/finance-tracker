import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import NeonDetailHeader from '../../src/neon/ui/NeonDetailHeader.vue'

describe('NeonDetailHeader', () => {
  it('es solo la flecha que vuelve a la sección y el símbolo', () => {
    const wrapper = mount(NeonDetailHeader, {
      props: { label: 'VWCE', backHref: '/investment', backLabel: 'Inversión' },
    })

    const back = wrapper.get('a')
    expect(back.attributes('href')).toBe('/investment')
    expect(back.attributes('aria-label')).toBe('Volver a Inversión')
    expect(back.text()).toBe('')
    expect(wrapper.get('h1').text()).toBe('VWCE')
    expect(wrapper.findAll('a, button')).toHaveLength(1)
  })
})
