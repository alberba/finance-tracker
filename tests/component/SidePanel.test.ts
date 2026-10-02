import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import SidePanel from '../../src/components/ui/SidePanel.vue'

function mountPanel(open = false) {
  return mount(SidePanel, {
    attachTo: document.body,
    props: {
      open,
      'onUpdate:open': () => {},
      kicker: 'Movimiento',
      title: 'Nuevo movimiento',
      titleId: 'tx-panel-title',
    },
    slots: {
      default: '<label>Importe<input name="amount" /></label>',
      footer: '<button type="button">Guardar</button>',
    },
  })
}

describe('SidePanel', () => {
  it('es un diálogo modal con nombre que se abre al pedirlo', async () => {
    const wrapper = mountPanel()
    const dialog = wrapper.get('dialog').element as HTMLDialogElement
    expect(dialog.open).toBe(false)

    await wrapper.setProps({ open: true } as Record<string, unknown>)
    await nextTick()

    expect(dialog.open).toBe(true)
    expect(dialog.getAttribute('aria-labelledby')).toBe('tx-panel-title')
    expect(wrapper.get('#tx-panel-title').text()).toBe('Nuevo movimiento')
    expect(wrapper.text()).toContain('Movimiento')
    wrapper.unmount()
  })

  it('pide cerrarse con el botón de cerrar', async () => {
    const wrapper = mountPanel(true)
    await nextTick()

    await wrapper.get('button[aria-label="Cerrar"]').trigger('click')

    expect(wrapper.emitted('update:open')).toEqual([[false]])
    wrapper.unmount()
  })

  it('pide cerrarse con Escape', async () => {
    const wrapper = mountPanel(true)
    await nextTick()

    await wrapper.get('dialog').trigger('cancel')

    expect(wrapper.emitted('update:open')).toEqual([[false]])
    wrapper.unmount()
  })

  it('devuelve el foco a quien lo abrió al cerrarse', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const wrapper = mountPanel()

    await wrapper.setProps({ open: true } as Record<string, unknown>)
    await nextTick()
    await wrapper.setProps({ open: false } as Record<string, unknown>)
    await nextTick()

    expect((wrapper.get('dialog').element as HTMLDialogElement).open).toBe(false)
    expect(document.activeElement).toBe(opener)
    wrapper.unmount()
    opener.remove()
  })
})
