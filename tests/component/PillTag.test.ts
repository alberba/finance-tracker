import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PillTag from '../../src/components/ui/PillTag.vue'

describe('PillTag', () => {
  it('muestra su texto', () => {
    const wrapper = mount(PillTag, { slots: { default: 'Compra' } })

    expect(wrapper.text()).toBe('Compra')
  })

  it('expone el tono para distinguir variantes sin depender de clases', () => {
    const neutral = mount(PillTag, { slots: { default: 'EUR' } })
    const accent = mount(PillTag, { props: { tone: 'accent' }, slots: { default: 'Venta' } })

    expect(neutral.attributes('data-tone')).toBe('neutral')
    expect(accent.attributes('data-tone')).toBe('accent')

    const gain = mount(PillTag, { props: { tone: 'gain' }, slots: { default: 'Cumplida' } })
    expect(gain.attributes('data-tone')).toBe('gain')
  })
})
