import { GRID_COLUMNS, type LayoutItem } from './engine'

/**
 * Where the cells are on the screen, measured from the grid element: the left
 * and top of its first cell, the side of a cell and the gap between two. A
 * `pitch` is the distance from one cell to the next.
 */
export interface GridMetrics {
  left: number
  top: number
  cell: number
  gap: number
  pitch: number
}

interface Point {
  x: number
  y: number
}

export function gridMetrics(
  rect: { left: number; top: number; width: number },
  gap: number,
): GridMetrics {
  const cell = Math.max((rect.width - gap * (GRID_COLUMNS - 1)) / GRID_COLUMNS, 1)
  return { left: rect.left, top: rect.top, cell, gap, pitch: cell + gap }
}

/** Where inside a widget the pointer took hold of it, from its top-left corner. */
export function grabOffset(metrics: GridMetrics, pointer: Point, item: LayoutItem): Point {
  return {
    x: pointer.x - (metrics.left + item.col * metrics.pitch),
    y: pointer.y - (metrics.top + item.row * metrics.pitch),
  }
}

/** The cell the widget's top-left corner is nearest to when it is held at `grab`. */
export function moveTarget(
  metrics: GridMetrics,
  pointer: Point,
  grab: Point,
): { col: number; row: number } {
  return {
    col: Math.round((pointer.x - grab.x - metrics.left) / metrics.pitch),
    row: Math.round((pointer.y - grab.y - metrics.top) / metrics.pitch),
  }
}

/** Where inside the resize handle the pointer took hold, from the widget's bottom-right corner. */
export function cornerOffset(metrics: GridMetrics, pointer: Point, item: LayoutItem): Point {
  return {
    x: pointer.x - (metrics.left + (item.col + item.w) * metrics.pitch - metrics.gap),
    y: pointer.y - (metrics.top + (item.row + item.h) * metrics.pitch - metrics.gap),
  }
}

/** The width and height, in cells, the widget has when its corner is held at `grab`. */
export function resizeTarget(
  metrics: GridMetrics,
  pointer: Point,
  grab: Point,
  item: LayoutItem,
): { w: number; h: number } {
  const right = pointer.x - grab.x - metrics.left + metrics.gap
  const down = pointer.y - grab.y - metrics.top + metrics.gap
  return {
    w: Math.round(right / metrics.pitch) - item.col,
    h: Math.round(down / metrics.pitch) - item.row,
  }
}

/** Whether the pointer is over the grid's columns and at or below its top. */
export function overGrid(metrics: GridMetrics, pointer: Point): boolean {
  return (
    pointer.x >= metrics.left &&
    pointer.x <= metrics.left + GRID_COLUMNS * metrics.pitch - metrics.gap &&
    pointer.y >= metrics.top
  )
}
