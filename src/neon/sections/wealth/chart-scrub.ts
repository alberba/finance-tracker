import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

/** How long a finger rests before the chart is read instead of the page scrolled. */
export const SCRUB_HOLD_MS = 140
/** A finger that travels farther than this (px) before the hold is scrolling. */
const SCRUB_SLOP = 10

/** The index of the position (percent of the plot) closest to `percent`; -1 without positions. */
export function nearestPoint(positions: readonly number[], percent: number): number {
  let best = -1
  let distance = Infinity
  positions.forEach((position, index) => {
    const gap = Math.abs(position - percent)
    if (gap < distance) {
      best = index
      distance = gap
    }
  })
  return best
}

/**
 * Reading a chart with a finger: rest it on `host` for a moment and slide, and
 * `index` follows the finger over the points of `plot`; lift it and `index` is
 * null again. Before the hold the page scrolls as usual, and a button inside
 * `host` keeps its own tap. `positions` are the x of each point in percent of
 * the plot's width.
 */
export function useChartScrub(
  host: Ref<HTMLElement | null>,
  plot: Ref<HTMLElement | null>,
  positions: () => readonly number[],
): { index: Ref<number | null> } {
  const index = ref<number | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let pointer: { id: number; x: number; y: number } | null = null
  let active = false

  function read(clientX: number): void {
    const rect = plot.value?.getBoundingClientRect()
    if (!rect?.width) return
    const found = nearestPoint(positions(), ((clientX - rect.left) / rect.width) * 100)
    index.value = found < 0 ? null : found
  }

  function stop(): void {
    clearTimeout(timer)
    timer = undefined
    pointer = null
    active = false
    index.value = null
  }

  function down(event: PointerEvent): void {
    if (!event.isPrimary || (event.target as Element).closest('button, a, input')) return
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
    timer = setTimeout(() => {
      if (!pointer) return
      active = true
      host.value?.setPointerCapture?.(pointer.id)
      read(pointer.x)
    }, SCRUB_HOLD_MS)
  }

  function move(event: PointerEvent): void {
    if (!pointer || event.pointerId !== pointer.id) return
    if (active) {
      pointer.x = event.clientX
      read(event.clientX)
    } else if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > SCRUB_SLOP) {
      // It moved before the hold: the finger is scrolling or swiping.
      stop()
    }
  }

  // Once reading, the page must not scroll under the finger.
  function touch(event: TouchEvent): void {
    if (active && event.cancelable) event.preventDefault()
  }

  // The host may come and go (the cover has no chart until there is an account).
  function listen(el: HTMLElement, on: boolean): void {
    const toggle = on ? el.addEventListener.bind(el) : el.removeEventListener.bind(el)
    toggle('pointerdown', down as EventListener)
    toggle('pointermove', move as EventListener)
    toggle('pointerup', stop)
    toggle('pointercancel', stop)
    toggle('touchmove', touch as EventListener, { passive: false })
  }
  watch(
    host,
    (el, previous) => {
      if (previous) listen(previous, false)
      if (el) listen(el, true)
      stop()
    },
    { immediate: true, flush: 'post' },
  )
  onBeforeUnmount(() => {
    if (host.value) listen(host.value, false)
    stop()
  })

  return { index }
}
