import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import NeonSettingsField from '../../src/neon/sections/settings/NeonSettingsField.vue'

describe('NeonSettingsField', () => {
  it('envía el valor al salir del campo y al pulsar Enter, solo si cambió', async () => {
    const wrapper = mount(NeonSettingsField, { props: { modelValue: 'Nómina', label: 'Nombre' } })
    const input = wrapper.get('input')

    await input.trigger('change')
    expect(wrapper.emitted('commit')).toBeUndefined()

    await input.setValue('Ahorro')
    await input.trigger('keydown.enter')
    expect(wrapper.emitted('commit')).toEqual([['Ahorro']])
  })

  it('vuelve al valor guardado si el padre no acepta el cambio', async () => {
    const wrapper = mount(NeonSettingsField, { props: { modelValue: 'Nómina', label: 'Nombre' } })
    const input = wrapper.get('input')

    await input.setValue('')
    await input.trigger('change')
    await wrapper.vm.$nextTick()

    expect(input.element.value).toBe('Nómina')
  })

  it('con v-model sigue cada pulsación para que la fila nueva conserve lo escrito', async () => {
    const wrapper = mount(NeonSettingsField, { props: { modelValue: '', label: 'Nueva' } })

    await wrapper.get('input').setValue('Mascotas')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Mascotas'])
  })
})
