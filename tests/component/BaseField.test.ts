import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BaseInput from '../../src/components/ui/BaseInput.vue'
import BaseSelect from '../../src/components/ui/BaseSelect.vue'

describe('BaseInput', () => {
  it('envuelve el campo en su etiqueta y pasa los atributos al input', () => {
    const wrapper = mount(BaseInput, {
      props: { label: 'Descripción', modelValue: 'Mercadona' },
      attrs: { name: 'description', maxlength: '140' },
    })

    const input = wrapper.get('label input')
    expect(wrapper.get('label').text()).toContain('Descripción')
    expect(input.attributes('name')).toBe('description')
    expect(input.attributes('maxlength')).toBe('140')
    expect((input.element as HTMLInputElement).value).toBe('Mercadona')
  })

  it('emite lo que se teclea', async () => {
    const wrapper = mount(BaseInput, { props: { label: 'Descripción', modelValue: '' } })

    await wrapper.get('input').setValue('Luz')

    expect(wrapper.emitted('update:modelValue')).toEqual([['Luz']])
  })

  it('puede ocultar la etiqueta sin quitarle el nombre al campo', () => {
    const wrapper = mount(BaseInput, {
      props: { label: 'Buscar movimientos', modelValue: '', hideLabel: true },
    })

    expect(wrapper.get('label span.sr-only').text()).toBe('Buscar movimientos')
  })
})

describe('BaseSelect', () => {
  it('pinta las opciones y emite la elegida', async () => {
    const wrapper = mount(BaseSelect, {
      props: {
        label: 'Cuenta',
        modelValue: 'bbva',
        options: [
          { value: 'bbva', label: 'BBVA Nómina' },
          { value: 'revolut', label: 'Revolut' },
        ],
      },
    })

    expect(wrapper.findAll('option').map((option) => option.text())).toEqual([
      'BBVA Nómina',
      'Revolut',
    ])
    await wrapper.get('select').setValue('revolut')
    expect(wrapper.emitted('update:modelValue')).toEqual([['revolut']])
  })

  it('conserva el tipo numérico de los valores', async () => {
    const wrapper = mount(BaseSelect, {
      props: {
        label: 'Año',
        modelValue: 2026,
        options: [
          { value: 2026, label: '2026' },
          { value: 2025, label: '2025' },
        ],
      },
    })

    await wrapper.get('select').setValue('2025')

    expect(wrapper.emitted('update:modelValue')).toEqual([[2025]])
  })
})
