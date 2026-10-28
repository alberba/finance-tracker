import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ReportComposer from '../../src/components/reports/ReportComposer.vue'

function mountComposer(props: { pending?: boolean; error?: string; resetSignal?: number } = {}) {
  return mount(ReportComposer, {
    props: { pending: false, error: '', resetSignal: 0, ...props },
  })
}

function addFile(wrapper: ReturnType<typeof mountComposer>, file: File): Promise<void> {
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  return input.trigger('change')
}

afterEach(() => {
  vi.restoreAllMocks()
})

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
    expect(wrapper.get('[role="status"]').text()).toBe('Aclaración publicada.')
  })

  it('muestra un error si no puede leer un adjunto y no publica', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:captura')
    const wrapper = mountComposer()
    await wrapper.get('textarea').setValue('Con captura rota')

    const file = new File(['contenido'], 'captura.png', { type: 'image/png' })
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.reject(new Error('lectura fallida')),
    })
    await addFile(wrapper, file)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'No se pudieron leer los adjuntos. Inténtalo de nuevo.',
    )
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('no publica dos veces si se envía mientras se codifican los adjuntos', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:captura')
    let release!: (value: ArrayBuffer) => void
    const wrapper = mountComposer()
    await wrapper.get('textarea').setValue('Con captura')

    const file = new File(['contenido'], 'captura.png', { type: 'image/png' })
    Object.defineProperty(file, 'arrayBuffer', {
      value: () =>
        new Promise<ArrayBuffer>((resolve) => {
          release = resolve
        }),
    })
    await addFile(wrapper, file)

    const form = wrapper.get('form')
    void form.trigger('submit')
    await form.trigger('submit')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()

    release(new Uint8Array([1]).buffer)
    await flushPromises()

    expect(wrapper.emitted('submit')).toHaveLength(1)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })
})
