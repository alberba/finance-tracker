// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, nextTick, shallowRef, type App, type Ref } from 'vue'

import { nearestPoint, SCRUB_HOLD_MS, useChartScrub } from '../../src/neon/ui/chart-scrub'

describe('nearestPoint', () => {
  const positions = [0, 25, 50, 97]

  it('picks the point closest to where the finger is, in percent of the plot', () => {
    expect(nearestPoint(positions, 10)).toBe(0)
    expect(nearestPoint(positions, 20)).toBe(1)
    expect(nearestPoint(positions, 60)).toBe(2)
    expect(nearestPoint(positions, 80)).toBe(3)
  })

  it('stays on the first and last points when the finger leaves the plot', () => {
    expect(nearestPoint(positions, -40)).toBe(0)
    expect(nearestPoint(positions, 180)).toBe(3)
  })

  it('has no point when there is nothing to read', () => {
    expect(nearestPoint([], 50)).toBe(-1)
  })
})

type Listener = (event: unknown) => void

/** A host that records its listeners, so the tests fire the pointer events by hand. */
function fakeHost() {
  const listeners = new Map<string, Listener>()
  return {
    listeners,
    setPointerCapture: vi.fn(),
    addEventListener: vi.fn((type: string, listener: Listener) => listeners.set(type, listener)),
    removeEventListener: vi.fn((type: string, listener: Listener) => {
      if (listeners.get(type) === listener) listeners.delete(type)
    }),
    fire(type: string, event: unknown = {}) {
      listeners.get(type)?.(event)
    },
  }
}

type Host = ReturnType<typeof fakeHost>

const POSITIONS = [0, 50, 100]
const plotOf = (width = 200) => ({ getBoundingClientRect: () => ({ left: 100, width }) }) as Element

function pointer(overrides: Record<string, unknown> = {}) {
  return {
    isPrimary: true,
    pointerType: 'touch',
    pointerId: 1,
    clientX: 100,
    clientY: 50,
    ...overrides,
  }
}

describe('useChartScrub', () => {
  let app: App | null = null
  let host: Ref<Host | null>
  let plot: Ref<Element | null>
  let index: Ref<number | null>
  const tap = vi.fn()

  function mount(initial: Host | null, plotElement: Element | null = plotOf()) {
    host = shallowRef(initial)
    plot = shallowRef(plotElement)
    app = createApp(
      defineComponent({
        setup() {
          index = useChartScrub(
            host as unknown as Ref<HTMLElement | null>,
            plot,
            () => POSITIONS,
            tap,
          ).index
          return () => null
        },
      }),
    )
    app.mount(document.createElement('div'))
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    app?.unmount()
    app = null
    vi.useRealTimers()
  })

  it('tras el reposo lee el gráfico bajo el dedo y lo sigue al deslizar', () => {
    const el = fakeHost()
    mount(el)
    el.fire('pointerdown', pointer({ clientX: 100 }))
    expect(index.value).toBeNull()

    vi.advanceTimersByTime(SCRUB_HOLD_MS)
    expect(el.setPointerCapture).toHaveBeenCalledWith(1)
    expect(index.value).toBe(0)

    el.fire('pointermove', pointer({ clientX: 210 }))
    expect(index.value).toBe(1)
    el.fire('pointermove', pointer({ clientX: 400 }))
    expect(index.value).toBe(2)

    el.fire('pointerup', pointer({ clientX: 400 }))
    expect(index.value).toBeNull()
    expect(tap).not.toHaveBeenCalled()
  })

  it('un toque corto sin reposo pulsa el punto más cercano', () => {
    const el = fakeHost()
    mount(el)
    el.fire('pointerdown', pointer({ clientX: 200 }))
    el.fire('pointerup', pointer({ clientX: 203, clientY: 52 }))
    expect(tap).toHaveBeenCalledWith(1)
    // The hold never fires once the finger is up.
    vi.advanceTimersByTime(SCRUB_HOLD_MS * 2)
    expect(index.value).toBeNull()
  })

  it('si el dedo se mueve antes del reposo, la página se desplaza y no se lee nada', () => {
    const el = fakeHost()
    mount(el)
    el.fire('pointerdown', pointer())
    el.fire('pointermove', pointer({ clientY: 120 }))
    vi.advanceTimersByTime(SCRUB_HOLD_MS * 2)
    expect(index.value).toBeNull()
    expect(el.setPointerCapture).not.toHaveBeenCalled()
    el.fire('pointerup', pointer({ clientY: 120 }))
    expect(tap).not.toHaveBeenCalled()
  })

  it('un movimiento pequeño antes del reposo no cancela la lectura', () => {
    const el = fakeHost()
    mount(el)
    el.fire('pointerdown', pointer())
    el.fire('pointermove', pointer({ clientX: 103 }))
    vi.advanceTimersByTime(SCRUB_HOLD_MS)
    expect(index.value).toBe(0)
  })

  it('un toque que viaja más allá del margen no cuenta como pulsación', () => {
    const el = fakeHost()
    mount(el)
    el.fire('pointerdown', pointer())
    el.fire('pointerup', pointer({ clientX: 160 }))
    expect(tap).not.toHaveBeenCalled()
  })

  it('solo escucha el primer dedo táctil', () => {
    const el = fakeHost()
    mount(el)
    el.fire('pointerdown', pointer({ pointerType: 'mouse' }))
    el.fire('pointerdown', pointer({ isPrimary: false }))
    vi.advanceTimersByTime(SCRUB_HOLD_MS)
    expect(index.value).toBeNull()
    expect(el.setPointerCapture).not.toHaveBeenCalled()
  })

  it('ignora el movimiento y el final de otro puntero', () => {
    const el = fakeHost()
    mount(el)
    el.fire('pointermove', pointer())
    el.fire('pointerup', pointer())
    el.fire('pointerdown', pointer({ pointerId: 1 }))
    vi.advanceTimersByTime(SCRUB_HOLD_MS)
    el.fire('pointermove', pointer({ pointerId: 2, clientX: 300 }))
    expect(index.value).toBe(0)
    el.fire('pointerup', pointer({ pointerId: 2 }))
    expect(index.value).toBe(0)
  })

  it('cancelar el puntero deja de leer', () => {
    const el = fakeHost()
    mount(el)
    el.fire('pointerdown', pointer())
    vi.advanceTimersByTime(SCRUB_HOLD_MS)
    expect(index.value).toBe(0)
    el.fire('pointercancel')
    expect(index.value).toBeNull()
  })

  it('sin gráfico o sin ancho no hay nada que leer ni pulsar', async () => {
    const el = fakeHost()
    mount(el, plotOf(0))
    el.fire('pointerdown', pointer())
    vi.advanceTimersByTime(SCRUB_HOLD_MS)
    expect(index.value).toBeNull()
    el.fire('pointerup', pointer())
    expect(tap).not.toHaveBeenCalled()

    plot.value = null
    el.fire('pointerdown', pointer())
    el.fire('pointerup', pointer())
    expect(tap).not.toHaveBeenCalled()
  })

  it('mientras lee, la página no se desplaza bajo el dedo', () => {
    const el = fakeHost()
    mount(el)
    const preventDefault = vi.fn()
    el.fire('touchmove', { cancelable: true, preventDefault })
    expect(preventDefault).not.toHaveBeenCalled()

    el.fire('pointerdown', pointer())
    vi.advanceTimersByTime(SCRUB_HOLD_MS)
    el.fire('touchmove', { cancelable: false, preventDefault })
    expect(preventDefault).not.toHaveBeenCalled()
    el.fire('touchmove', { cancelable: true, preventDefault })
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('no falla si el navegador no permite capturar el puntero', () => {
    const el = fakeHost()
    mount(el)
    ;(el as { setPointerCapture?: unknown }).setPointerCapture = undefined
    el.fire('pointerdown', pointer())
    vi.advanceTimersByTime(SCRUB_HOLD_MS)
    expect(index.value).toBe(0)
  })

  it('escucha al host cuando aparece y lo suelta cuando cambia o se desmonta', async () => {
    mount(null)
    const first = fakeHost()
    const second = fakeHost()

    host.value = first
    await nextTick()
    first.fire('pointerdown', pointer())
    vi.advanceTimersByTime(SCRUB_HOLD_MS)
    expect(index.value).toBe(0)

    host.value = second
    await nextTick()
    expect(first.listeners.size).toBe(0)
    expect(second.listeners.size).toBeGreaterThan(0)
    expect(index.value).toBeNull()

    host.value = null
    await nextTick()
    expect(second.listeners.size).toBe(0)

    host.value = second
    await nextTick()
    app?.unmount()
    app = null
    expect(second.listeners.size).toBe(0)
  })
})
