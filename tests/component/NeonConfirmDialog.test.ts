import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import NeonConfirmDialog from '../../src/neon/ui/NeonConfirmDialog.vue'

function mountDialog() {
  return mount(NeonConfirmDialog, {
    props: { open: true, title: '¿Eliminar esta cuenta?', confirmLabel: 'Eliminar cuenta' },
    slots: { default: 'Cuenta Vacaciones. No se puede deshacer.' },
  })
}

describe('NeonConfirmDialog', () => {
  it('es un alertdialog con el título, la consecuencia y las dos acciones', () => {
    const wrapper = mountDialog()
    const dialog = wrapper.get('dialog')

    expect(dialog.attributes('role')).toBe('alertdialog')
    expect(dialog.text()).toContain('¿Eliminar esta cuenta?')
    expect(dialog.text()).toContain('Cuenta Vacaciones. No se puede deshacer.')
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual([
      'Cancelar',
      'Eliminar cuenta',
    ])
  })

  it('confirma y se cierra con la acción', async () => {
    const wrapper = mountDialog()

    await wrapper.findAll('button')[1].trigger('click')

    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })

  it('cancela sin confirmar', async () => {
    const wrapper = mountDialog()

    await wrapper.findAll('button')[0].trigger('click')

    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })
})
