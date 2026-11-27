import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import NeonDetailHeader from '../../src/neon/ui/NeonDetailHeader.vue'

describe('NeonDetailHeader', () => {
  it('la flecha vuelve a la sección y se anuncia con su destino', () => {
    const wrapper = mount(NeonDetailHeader, {
      props: { label: 'VWCE', backHref: '/investment', backLabel: 'Inversión' },
    })

    const back = wrapper.get('a')
    expect(back.attributes('href')).toBe('/investment')
    expect(back.attributes('aria-label')).toBe('Volver a Inversión')
    expect(wrapper.get('h1').text()).toBe('VWCE')
  })
})
