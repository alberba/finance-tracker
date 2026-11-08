import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import NeonDetailPanel from '../../src/neon/ui/NeonDetailPanel.vue'

const cleanups: Array<() => void> = []

/** The panel with its model wired like a parent would, plus a button that «opens» it. */
function mountPanel(open = false) {
  const opener = document.createElement('button')
  opener.textContent = 'Abrir detalle'
  document.body.append(opener)
  const wrapper = mount(NeonDetailPanel, {
    attachTo: document.body,
    props: {
      open,
      title: 'Alquiler',
      kicker: 'Pendiente',
      'onUpdate:open': (value: boolean) =>
        wrapper.setProps({ open: value } as Record<string, unknown>),
    },
    slots: {
      default: '<p>Vence mañana</p>',
      footer: '<button type="button">Confirmar</button>',
    },
  })
  cleanups.push(() => {
    wrapper.unmount()
    opener.remove()
  })
  const dialog = wrapper.get('dialog').element as HTMLDialogElement
  return { wrapper, dialog, opener }
}

/** A sheet 400px tall: happy-dom has no layout, so the height the drag reads is stubbed. */
function stubHeight(dialog: HTMLDialogElement, height = 400) {
  dialog.getBoundingClientRect = () => ({ height, width: 360 }) as DOMRect
}

function pointer(type: string, clientY: number, timeStamp: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    clientY: { value: clientY },
    pointerId: { value: 1 },
    timeStamp: { value: timeStamp },
  })
  return event
}

async function drag(handle: Element, moves: Array<{ y: number; at: number }>): Promise<void> {
  handle.dispatchEvent(pointer('pointerdown', 100, 0))
  for (const move of moves) handle.dispatchEvent(pointer('pointermove', 100 + move.y, move.at))
  const last = moves[moves.length - 1]
  handle.dispatchEvent(pointer('pointerup', 100 + last.y, last.at))
  await nextTick()
}

/** Pretends the window is as wide as `frame` (desktop) or narrower (sheet). */
function stubFrame(desktop: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width') ? desktop : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  cleanups.splice(0).forEach((cleanup) => cleanup())
})

describe('NeonDetailPanel', () => {
  it('es un diálogo modal con nombre que se abre al pedirlo', async () => {
    const { wrapper, dialog } = mountPanel()
    expect(dialog.open).toBe(false)

    await wrapper.setProps({ open: true } as Record<string, unknown>)
    await nextTick()

    expect(dialog.open).toBe(true)
    const titleId = dialog.getAttribute('aria-labelledby') as string
    expect(wrapper.get(`#${titleId}`).text()).toBe('Alquiler')
    expect(wrapper.text()).toContain('Pendiente')
    expect(wrapper.text()).toContain('Vence mañana')
    expect(wrapper.text()).toContain('Confirmar')
  })

  it('pide cerrarse con su botón', async () => {
    const { wrapper } = mountPanel(true)
    await nextTick()

    await wrapper.get('button[aria-label="Cerrar"]').trigger('click')

    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })

  it('pide cerrarse con Escape sin dejar que el navegador la cierre por su cuenta', async () => {
    const { wrapper, dialog } = mountPanel(true)
    await nextTick()
    const cancel = new Event('cancel', { cancelable: true })

    dialog.dispatchEvent(cancel)

    expect(cancel.defaultPrevented).toBe(true)
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })

  it('pide cerrarse al pulsar el velo y no al pulsar el contenido', async () => {
    const { wrapper, dialog } = mountPanel(true)
    await nextTick()

    await wrapper.get('p').trigger('click')
    expect(wrapper.emitted('update:open')).toBeUndefined()

    dialog.dispatchEvent(new Event('click', { bubbles: true }))
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })

  it('devuelve el foco al elemento que lo abrió al cerrarse', async () => {
    const { wrapper, dialog, opener } = mountPanel()
    opener.focus()

    await wrapper.setProps({ open: true } as Record<string, unknown>)
    await nextTick()
    expect(dialog.open).toBe(true)
    ;(wrapper.get('button[aria-label="Cerrar"]').element as HTMLElement).focus()

    await wrapper.setProps({ open: false } as Record<string, unknown>)
    // It slides out first (200ms), then closes and hands the focus back.
    await vi.waitFor(() => expect(dialog.open).toBe(false))

    expect(document.activeElement).toBe(opener)
  })

  describe('arrastrar la hoja (móvil)', () => {
    beforeEach(() => stubFrame(false))

    it('cierra al arrastrar el agarre más del 30 % de su alto', async () => {
      const { wrapper, dialog } = mountPanel(true)
      await nextTick()
      stubHeight(dialog)

      await drag(wrapper.get('[data-sheet-handle]').element, [
        { y: 60, at: 300 },
        { y: 130, at: 700 },
      ])

      expect(wrapper.emitted('update:open')).toEqual([[false]])
    })

    it('cierra con un tirón rápido aunque recorra poco', async () => {
      const { wrapper, dialog } = mountPanel(true)
      await nextTick()
      stubHeight(dialog)

      // 40px in 100ms: 0,4 px/ms, far above 0,11, and only 10 % of the height.
      await drag(wrapper.get('[data-sheet-handle]').element, [{ y: 40, at: 100 }])

      expect(wrapper.emitted('update:open')).toEqual([[false]])
    })

    it('vuelve a su sitio si se suelta despacio y por debajo del 30 %', async () => {
      const { wrapper, dialog } = mountPanel(true)
      await nextTick()
      stubHeight(dialog)

      await drag(wrapper.get('[data-sheet-handle]').element, [{ y: 40, at: 2000 }])

      expect(wrapper.emitted('update:open')).toBeUndefined()
      expect(dialog.open).toBe(true)
    })

    it('arrastrar hacia arriba nunca la cierra', async () => {
      const { wrapper, dialog } = mountPanel(true)
      await nextTick()
      stubHeight(dialog)

      await drag(wrapper.get('[data-sheet-handle]').element, [{ y: -300, at: 50 }])

      expect(wrapper.emitted('update:open')).toBeUndefined()
    })

    it('el botón de cerrar de la cabecera no arranca un arrastre', async () => {
      const { wrapper, dialog } = mountPanel(true)
      await nextTick()
      stubHeight(dialog)

      await drag(wrapper.get('button[aria-label="Cerrar"]').element, [{ y: 300, at: 50 }])

      expect(wrapper.emitted('update:open')).toBeUndefined()
    })
  })

  it('como panel lateral de escritorio no se arrastra', async () => {
    stubFrame(true)
    const { wrapper, dialog } = mountPanel(true)
    await nextTick()
    stubHeight(dialog)

    await drag(wrapper.get('[data-sheet-handle]').element, [{ y: 300, at: 50 }])

    expect(wrapper.emitted('update:open')).toBeUndefined()
  })
})
