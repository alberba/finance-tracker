import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import ConfirmDialog from '../../src/components/ui/ConfirmDialog.vue'

function mountDialog(open = false) {
  return mount(ConfirmDialog, {
    attachTo: document.body,
    props: {
      open,
      'onUpdate:open': () => {},
      title: '¿Eliminar este movimiento?',
      titleId: 'confirm-title',
      confirmLabel: 'Eliminar',
    },
    slots: { default: 'Compra de VWCE del 15 jul.' },
  })
}

describe('ConfirmDialog', () => {
  it('es un alertdialog modal con nombre y descripción', async () => {
    const wrapper = mountDialog()
    const dialog = wrapper.get('dialog').element as HTMLDialogElement
    expect(dialog.open).toBe(false)

    await wrapper.setProps({ open: true } as Record<string, unknown>)
    await nextTick()

    expect(dialog.open).toBe(true)
    expect(dialog.getAttribute('role')).toBe('alertdialog')
    expect(dialog.getAttribute('aria-labelledby')).toBe('confirm-title')
    const description = dialog.getAttribute('aria-describedby')
    expect(wrapper.get(`#${description}`).text()).toBe('Compra de VWCE del 15 jul.')
    wrapper.unmount()
  })

  it('confirma y se cierra al pulsar la acción', async () => {
    const wrapper = mountDialog(true)
    await nextTick()

    await wrapper.get('button[data-confirm]').trigger('click')

    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('update:open')).toEqual([[false]])
    wrapper.unmount()
  })

  it('se cierra sin confirmar con Cancelar y con Escape', async () => {
    const wrapper = mountDialog(true)
    await nextTick()

    const cancel = wrapper.findAll('button').find((button) => button.text() === 'Cancelar')
    await cancel!.trigger('click')
    await wrapper.get('dialog').trigger('cancel')

    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.emitted('update:open')).toEqual([[false], [false]])
    wrapper.unmount()
  })

  it('pone el foco en Cancelar al abrirse y lo devuelve al cerrarse', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const wrapper = mountDialog()

    await wrapper.setProps({ open: true } as Record<string, unknown>)
    await nextTick()
    expect((document.activeElement as HTMLElement).textContent?.trim()).toBe('Cancelar')

    await wrapper.setProps({ open: false } as Record<string, unknown>)
    await nextTick()
    expect(document.activeElement).toBe(opener)
    wrapper.unmount()
    opener.remove()
  })
})
