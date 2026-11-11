import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import NeonSwitch from '../../src/neon/ui/NeonSwitch.vue'

describe('NeonSwitch', () => {
  it('es un interruptor con nombre que refleja su estado', () => {
    const wrapper = mount(NeonSwitch, {
      props: { modelValue: true, label: 'Regla Alquiler activa' },
    })
    const button = wrapper.get('button')

    expect(button.attributes('role')).toBe('switch')
    expect(button.attributes('aria-label')).toBe('Regla Alquiler activa')
    expect(button.attributes('aria-checked')).toBe('true')
  })

  it('emite el estado contrario al pulsarlo', async () => {
    const wrapper = mount(NeonSwitch, { props: { modelValue: true, label: 'Regla' } })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })
})
