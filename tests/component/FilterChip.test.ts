import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import FilterChip from '../../src/components/ui/FilterChip.vue'

describe('FilterChip', () => {
  it('es una casilla con su etiqueta que refleja si el filtro está activo', () => {
    const wrapper = mount(FilterChip, { props: { label: 'Gastos', modelValue: true } })

    const input = wrapper.get('input[type="checkbox"]')
    expect((input.element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.get('label').text()).toContain('Gastos')
  })

  it('emite el nuevo estado al pulsarlo', async () => {
    const wrapper = mount(FilterChip, { props: { label: 'Gastos', modelValue: true } })

    await wrapper.get('input').setValue(false)

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })
})
