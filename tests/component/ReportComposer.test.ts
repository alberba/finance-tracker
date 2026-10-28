import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ReportComposer from '../../src/components/reports/ReportComposer.vue'

function mountComposer(props: { pending?: boolean; error?: string; resetSignal?: number } = {}) {
  return mount(ReportComposer, {
    props: { pending: false, error: '', resetSignal: 0, ...props },
  })
}

describe('ReportComposer', () => {
  it('publica el texto recortado sin adjuntos', async () => {
    const wrapper = mountComposer()
    await wrapper.get('textarea').setValue('  Ocurre solo en móvil.  ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.emitted('submit')).toEqual([
      [{ text: 'Ocurre solo en móvil.', attachments: [] }],
    ])
  })

  it('no envía una aclaración vacía y explica el motivo', async () => {
    const wrapper = mountComposer()
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe('Escribe una aclaración.')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('muestra el error del servidor y deshabilita el envío mientras publica', () => {
    const error = mountComposer({ error: 'GitHub no disponible' })
    expect(error.get('[role="alert"]').text()).toBe('GitHub no disponible')

    const pending = mountComposer({ pending: true })
    expect(pending.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(pending.get('textarea').attributes('disabled')).toBeDefined()
  })

  it('limpia el borrador y anuncia la publicación al cambiar la señal', async () => {
    const wrapper = mountComposer()
    await wrapper.get('textarea').setValue('Texto enviado')
    await wrapper.setProps({ resetSignal: 1 })

    expect(wrapper.get('textarea').element.value).toBe('')
    expect(wrapper.get('.sr-only').text()).toBe('Aclaración publicada.')
  })
})
