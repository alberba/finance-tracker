import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SegmentedControl from '../../src/components/ui/SegmentedControl.vue'

function mountControl(modelValue: 'simple' | 'twr' = 'simple') {
  return mount(SegmentedControl<'simple' | 'twr'>, {
    props: {
      options: [
        { value: 'simple', label: 'Simple' },
        { value: 'twr', label: 'TWR', ariaLabel: 'Rentabilidad TWR' },
      ],
      label: 'Modo de cálculo de rentabilidad',
      dataKey: 'return-mode',
      modelValue,
      'onUpdate:modelValue': () => {},
    },
  })
}

describe('SegmentedControl', () => {
  it('es un grupo con nombre de botones que indican si están pulsados', () => {
    const wrapper = mountControl('twr')

    expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe('Modo de cálculo de rentabilidad')
    const [simple, twr] = wrapper.findAll('button')
    expect(simple.attributes('aria-pressed')).toBe('false')
    expect(twr.attributes('aria-pressed')).toBe('true')
    expect(twr.attributes('aria-label')).toBe('Rentabilidad TWR')
  })

  it('expone el valor de cada opción como data-*', () => {
    const wrapper = mountControl()

    expect(wrapper.findAll('button').map((button) => button.attributes('data-return-mode'))).toEqual([
      'simple',
      'twr',
    ])
  })

  it('emite la opción elegida', async () => {
    const wrapper = mountControl()

    await wrapper.findAll('button')[1].trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['twr']])
  })
})
