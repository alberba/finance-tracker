import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import ReportThread from '../../src/components/reports/ReportThread.vue'
import type { ThreadItem } from '../../src/domain/reports/report-entry'

function item(overrides: Partial<ThreadItem> = {}): ThreadItem {
  return {
    id: 1,
    kind: 'maintainer',
    author: 'ana',
    createdAt: '2026-10-20T09:00:00.000Z',
    editedAt: null,
    text: 'Lo revisamos.',
    attachments: [],
    editable: false,
    ...overrides,
  }
}

function mountThread(items: ThreadItem[], canComment = true, editingId: number | null = null) {
  return mount(ReportThread, {
    props: {
      items,
      canComment,
      pending: false,
      error: '',
      editingId,
    },
  })
}

describe('ReportThread', () => {
  it('muestra solo acciones de edición en las aclaraciones propias editables', () => {
    const wrapper = mountThread([
      item(),
      item({ id: 2, kind: 'reporter', author: 'Tú', text: 'Mía', editable: true }),
    ])
    const articles = wrapper.findAll('[data-thread-item]')
    expect(articles[0].findAll('button')).toHaveLength(0)
    expect(articles[1].text()).toContain('Editar')
    expect(articles[1].text()).toContain('Borrar')
  })

  it('en solo lectura no ofrece editar ni borrar', () => {
    const wrapper = mountThread(
      [item({ id: 2, kind: 'reporter', author: 'Tú', editable: true })],
      false,
    )
    const article = wrapper.get('[data-thread-item="2"]')
    expect(article.findAll('button')).toHaveLength(0)
  })

  it('avisa de que quitar un adjunto no lo borra de GitHub', async () => {
    const wrapper = mountThread(
      [
        item({
          id: 3,
          kind: 'reporter',
          author: 'Tú',
          editable: true,
          text: 'Con captura',
          attachments: [
            { name: 'captura.png', url: 'https://github.com/user-attachments/assets/1' },
          ],
        }),
      ],
      true,
    )

    await wrapper.get('button').trigger('click')
    await wrapper.setProps({ editingId: 3 })
    const remove = wrapper.get('button[aria-label="Quitar adjunto"]')
    await remove.trigger('click')

    const status = wrapper.get('[role="status"]')
    expect(status.text()).toBe('Quitar un adjunto no lo borra de GitHub.')
  })

  it('muestra un error si no puede leer un adjunto y no envía la edición', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:captura')
    const wrapper = mountThread(
      [
        item({
          id: 4,
          kind: 'reporter',
          author: 'Tú',
          editable: true,
          text: 'Con captura rota',
        }),
      ],
      true,
    )
    const edit = wrapper.findAll('button').find((button) => button.text() === 'Editar')
    await edit?.trigger('click')
    await wrapper.setProps({ editingId: 4 })

    const file = new File(['contenido'], 'captura.png', { type: 'image/png' })
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.reject(new Error('lectura fallida')),
    })
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })

    await input.trigger('change')
    const save = wrapper.findAll('button').find((button) => button.text() === 'Guardar')
    await save?.trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'No se pudieron leer los adjuntos. Inténtalo de nuevo.',
    )
    expect(wrapper.emitted('update')).toBeUndefined()
  })

  it('muestra el texto editado y la marca de edición', () => {
    const wrapper = mountThread([
      item({ editedAt: '2026-10-21T09:00:00.000Z', text: '**Importante**' }),
    ])
    expect(wrapper.text()).toContain('editado')
    expect(wrapper.find('strong').text()).toBe('Importante')
  })
})
