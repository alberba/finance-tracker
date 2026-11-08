import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import NeonPopover from '../../src/neon/ui/NeonPopover.vue'

const cleanups: Array<() => void> = []

function mountPopover(open = false) {
  const outside = document.createElement('button')
  outside.textContent = 'Fuera'
  document.body.append(outside)
  const wrapper = mount(NeonPopover, {
    attachTo: document.body,
    props: {
      open,
      label: 'Por confirmar',
      'onUpdate:open': (value: boolean) =>
        wrapper.setProps({ open: value } as Record<string, unknown>),
    },
    slots: {
      trigger: `<template #trigger="{ toggle, expanded, panelId }">
        <button type="button" aria-haspopup="dialog" :aria-expanded="expanded" :aria-controls="panelId" @click="toggle">Abrir</button>
      </template>`,
      default: '<button type="button">Dentro</button>',
    },
  })
  cleanups.push(() => {
    wrapper.unmount()
    outside.remove()
  })
  return { wrapper, outside }
}

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
})

describe('NeonPopover', () => {
  it('muestra el contenido solo abierto y lo anuncia como diálogo con nombre', async () => {
    const { wrapper } = mountPopover()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)

    await wrapper.get('button[aria-haspopup="dialog"]').trigger('click')

    const panel = wrapper.get('[role="dialog"]')
    expect(panel.attributes('aria-label')).toBe('Por confirmar')
    expect(panel.text()).toContain('Dentro')
    expect(wrapper.get('button[aria-haspopup="dialog"]').attributes('aria-expanded')).toBe('true')
  })

  it('pide cerrarse al pulsar fuera y no al pulsar dentro', async () => {
    const { wrapper, outside } = mountPopover(true)
    await nextTick()

    wrapper
      .get('[role="dialog"] button')
      .element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(wrapper.emitted('update:open')).toBeUndefined()

    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })

  it('no cierra al pulsar su propio disparador (lo gestiona el disparador)', async () => {
    const { wrapper } = mountPopover(true)
    await nextTick()

    wrapper
      .get('button[aria-haspopup="dialog"]')
      .element.dispatchEvent(new Event('pointerdown', { bubbles: true }))

    expect(wrapper.emitted('update:open')).toBeUndefined()
  })

  it('pide cerrarse con Escape y devuelve el foco al disparador', async () => {
    const { wrapper } = mountPopover()
    const trigger = wrapper.get('button[aria-haspopup="dialog"]')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    ;(wrapper.get('[role="dialog"] button').element as HTMLElement).focus()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()

    expect(wrapper.emitted('update:open')).toEqual([[true], [false]])
    expect(document.activeElement).toBe(trigger.element)
  })

  it('no reacciona a Escape ni a pulsaciones fuera estando cerrado', async () => {
    const { wrapper, outside } = mountPopover()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }))

    expect(wrapper.emitted('update:open')).toBeUndefined()
  })
})
