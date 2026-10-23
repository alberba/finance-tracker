import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BaseInput from '../../src/components/ui/BaseInput.vue'
import BaseSelect from '../../src/components/ui/BaseSelect.vue'

describe('BaseInput', () => {
  it('nombra el campo con su etiqueta y pasa los atributos al input', () => {
    const wrapper = mount(BaseInput, {
      props: { label: 'Descripción', modelValue: 'Mercadona' },
      attrs: { name: 'description', maxlength: '140' },
    })

    const input = wrapper.get('input')
    expect(wrapper.get('label').text()).toBe('Descripción')
    expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'))
    expect(input.attributes('name')).toBe('description')
    expect(input.attributes('maxlength')).toBe('140')
    expect((input.element as HTMLInputElement).value).toBe('Mercadona')
  })

  it('emite lo que se teclea', async () => {
    const wrapper = mount(BaseInput, { props: { label: 'Descripción', modelValue: '' } })

    await wrapper.get('input').setValue('Luz')

    expect(wrapper.emitted('update:modelValue')).toEqual([['Luz']])
  })

  it('conserva el contrato de texto en los campos numéricos', async () => {
    const wrapper = mount(BaseInput, {
      props: { label: 'Títulos', modelValue: '' },
      attrs: { type: 'number', step: 'any' },
    })

    await wrapper.get('input').setValue('10.5')
    await wrapper.get('input').setValue('')

    expect(wrapper.emitted('update:modelValue')).toEqual([['10.5'], ['']])
  })

  it('usa el id que se le da para el campo', () => {
    const wrapper = mount(BaseInput, {
      props: { label: 'Importe', modelValue: '' },
      attrs: { id: 'tx-amount' },
    })

    expect(wrapper.get('input').attributes('id')).toBe('tx-amount')
    expect(wrapper.get('label').attributes('for')).toBe('tx-amount')
  })

  it('coloca la clase en el contenedor para situar el campo, no en el input', () => {
    const wrapper = mount(BaseInput, {
      props: { label: 'Descripción', modelValue: '' },
      attrs: { class: 'sm:col-span-2' },
    })

    expect(wrapper.classes()).toContain('sm:col-span-2')
    expect(wrapper.get('input').classes()).not.toContain('sm:col-span-2')
  })

  it('puede ocultar la etiqueta sin quitarle el nombre al campo', () => {
    const wrapper = mount(BaseInput, {
      props: { label: 'Buscar movimientos', modelValue: '', hideLabel: true },
    })

    expect(wrapper.get('label.sr-only').text()).toBe('Buscar movimientos')
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
