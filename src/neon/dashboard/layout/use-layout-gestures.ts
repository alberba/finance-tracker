import { onBeforeUnmount } from 'vue'

import { growItem, insertItem, moveItem, resizeItem, stepItem, type LayoutItem } from './engine'
import {
  cornerOffset,
  gridMetrics,
  grabOffset,
  moveTarget,
  overGrid,
  resizeTarget,
  type GridMetrics,
} from './geometry'
import { useDashboardLayoutStore } from './store'
import { WIDGETS, type WidgetId } from './widgets'

type Kind = 'move' | 'resize' | 'insert'

interface Gesture {
  kind: Kind
  id: WidgetId
  /** The widget when the gesture began (the catalog's initial size for an insert). */
  start: LayoutItem
  /** The layout the preview is made from: nothing in it has moved yet. */
  base: LayoutItem[]
  grab: { x: number; y: number }
}

/** How close to the top or bottom of the window the pointer scrolls the page, and how fast. */
const EDGE = 80
const SCROLL_SPEED = 18

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

function scrollParent(element: HTMLElement | null): HTMLElement | Window {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node
    }
  }
  return window
}

/**
 * The pointer and keyboard gestures that edit the home's layout (DESIGN.md,
 * «Inicio en escritorio»): drag a widget to move it, drag its corner to resize
 * it, drag one in from the catalog, and the arrow keys for the first two. A
 * gesture only ever touches the store's preview; releasing the pointer commits
 * it, Escape or a cancelled pointer drops it. Near the top or bottom of the
 * window a drag scrolls the page, since the grid can be as tall as it needs.
 */
export function useLayoutGestures(grid: () => HTMLElement | null) {
  const store = useDashboardLayoutStore()
  let gesture: Gesture | null = null
  let pointer = { x: 0, y: 0 }
  let frame = 0

  function metrics(): GridMetrics | null {
    const element = grid()
    if (!element) return null
    const rect = element.getBoundingClientRect()
    // The gap comes in CSS px and the rect in screen px; they differ under the
    // desktop zoom (`--ui-zoom`), so scale the gap to match.
    const scale = element.offsetWidth ? rect.width / element.offsetWidth : 1
    const gap = (Number.parseFloat(getComputedStyle(element).columnGap) || 0) * scale
    return gridMetrics(rect, gap)
  }

  function update(): void {
    const current = gesture
    const m = metrics()
    if (!current || !m) return
    if (current.kind === 'move') {
      const { col, row } = moveTarget(m, pointer, current.grab)
      store.setPreview(moveItem(current.base, current.id, col, row), current.id)
    } else if (current.kind === 'resize') {
      const { w, h } = resizeTarget(m, pointer, current.grab, current.start)
      store.setPreview(resizeItem(current.base, current.id, w, h), current.id)
    } else if (overGrid(m, pointer)) {
      const { col, row } = moveTarget(m, pointer, current.grab)
      store.ghost = null
      store.setPreview(insertItem(current.base, current.id, col, row), current.id)
    } else {
      store.setPreview(null)
      store.ghost = { id: current.id, x: pointer.x, y: pointer.y }
    }
  }

  function autoScroll(): void {
    if (!gesture) return
    const direction = pointer.y < EDGE ? -1 : pointer.y > window.innerHeight - EDGE ? 1 : 0
    if (direction) {
      const parent = scrollParent(grid())
      parent.scrollBy({ top: direction * SCROLL_SPEED })
      update()
    }
    frame = requestAnimationFrame(autoScroll)
  }

  function onMove(event: PointerEvent): void {
    pointer = { x: event.clientX, y: event.clientY }
    update()
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    finish(false)
  }

  function onUp(): void {
    finish(true)
  }

  function onCancel(): void {
    finish(false)
  }

  function finish(commit: boolean): void {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('scroll', update, true)
    cancelAnimationFrame(frame)
    const preview = store.preview
    const done = gesture
    gesture = null
    if (commit && preview && done) {
      store.commit(preview, `${WIDGETS[done.id].title}: ${describe(preview, done.id)}`)
    } else {
      store.setPreview(null)
      store.ghost = null
    }
  }

  function describe(items: readonly LayoutItem[], id: WidgetId): string {
    const item = items.find((candidate) => candidate.id === id)
    return item
      ? `columna ${item.col + 1}, fila ${item.row + 1}, ${item.w} por ${item.h} casillas.`
      : ''
  }

  function begin(kind: Kind, id: WidgetId, event: PointerEvent): void {
    if (event.button !== 0 || gesture) return
    const m = metrics()
    if (!m) return
    event.preventDefault()
    pointer = { x: event.clientX, y: event.clientY }
    const base = store.layout.items.filter((item) => kind !== 'insert' || item.id !== id)
    const found = store.layout.items.find((item) => item.id === id)
    const start: LayoutItem = found ?? { id, col: 0, row: 0, ...WIDGETS[id].initial }
    const grab =
      kind === 'move'
        ? grabOffset(m, pointer, start)
        : kind === 'resize'
          ? cornerOffset(m, pointer, start)
          : { x: (start.w * m.pitch - m.gap) / 2, y: (start.h * m.pitch - m.gap) / 2 }
    gesture = { kind, id, start, base, grab }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', update, true)
    frame = requestAnimationFrame(autoScroll)
    update()
  }

  /** The arrows move the focused widget; with Shift they resize it. Each press is kept. */
  function onWidgetKey(item: LayoutItem, event: KeyboardEvent): void {
    const arrow = ARROWS[event.key]
    if (!arrow || event.target !== event.currentTarget) return
    event.preventDefault()
    const [dx, dy] = arrow
    const next = event.shiftKey
      ? growItem(store.layout.items, item.id, dx, dy)
      : stepItem(store.layout.items, item.id, dx, dy)
    if (next) store.commit(next, `${WIDGETS[item.id].title}: ${describe(next, item.id)}`)
  }

  onBeforeUnmount(() => {
    if (gesture) finish(false)
  })

  return {
    beginMove: (item: LayoutItem, event: PointerEvent) => begin('move', item.id, event),
    beginResize: (item: LayoutItem, event: PointerEvent) => begin('resize', item.id, event),
    beginInsert: (id: WidgetId, event: PointerEvent) => begin('insert', id, event),
    onWidgetKey,
  }
}
