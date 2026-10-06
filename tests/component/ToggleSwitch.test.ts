import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ToggleSwitch from '../../src/components/ui/ToggleSwitch.vue'

describe('ToggleSwitch', () => {
  it('es un interruptor con nombre y su estado visible', () => {
    const wrapper = mount(ToggleSwitch, {
      props: { label: 'Netflix activa', onText: 'Activa', offText: 'Pausada', modelValue: false },
    })

    const input = wrapper.get('input')
    expect(input.attributes('role')).toBe('switch')
    expect(input.attributes('aria-label')).toBe('Netflix activa')
    expect((input.element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.text()).toContain('Pausada')
  })

  it('emite el nuevo estado al pulsarlo', async () => {
    const wrapper = mount(ToggleSwitch, {
      props: { label: 'Netflix activa', modelValue: false },
    })

    await wrapper.get('input').setValue(true)

    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })
})
