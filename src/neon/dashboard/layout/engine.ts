import { WIDGETS, isWidgetId, type CellSize, type WidgetId } from './widgets'

/**
 * The placement of the home's widgets on a grid of square cells: six columns
 * wide and as many rows tall as needed (DESIGN.md, «Inicio en escritorio»).
 * Pure functions over plain data, so the editing rules are tested without a
 * browser. Nothing here mutates its input.
 *
 * The rules: a widget never overlaps another, stays inside the six columns and
 * is at least its minimum size; whatever is below floats up until something
 * stops it (no empty row above a widget, empty cells to the side are fine);
 * a widget that is not in the list is not on the home.
 */
export const GRID_COLUMNS = 6

export interface LayoutItem extends CellSize {
  id: WidgetId
  /** 0-based column of its left edge. */
  col: number
  /** 0-based row of its top edge. */
  row: number
}

/** What is stored for a user: the widgets on the home; the rest sit in the catalog. */
export interface DashboardLayout {
  version: 1
  items: LayoutItem[]
}

const bottom = (item: LayoutItem) => item.row + item.h
const byPosition = (a: LayoutItem, b: LayoutItem) => a.row - b.row || a.col - b.col

export function overlaps(a: LayoutItem, b: LayoutItem): boolean {
  return a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h
}

function floatUp(item: LayoutItem, placed: readonly LayoutItem[]): LayoutItem {
  if (item.row === 0) return item
  const previousRow = { ...item, row: item.row - 1 }
  let row = 0
  for (const other of placed) {
    if (other.id === item.id || item.col >= other.col + other.w || other.col >= item.col + item.w)
      continue
    if (overlaps(previousRow, other)) return item
    if (bottom(other) <= item.row) row = Math.max(row, bottom(other))
  }
  return { ...item, row }
}

function clampItem(item: LayoutItem): LayoutItem {
  const min = WIDGETS[item.id].min
  const w = Math.min(Math.max(Math.round(item.w), min.w), GRID_COLUMNS)
  const h = Math.max(Math.round(item.h), min.h)
  return {
    id: item.id,
    w,
    h,
    col: Math.min(Math.max(Math.round(item.col), 0), GRID_COLUMNS - w),
    row: Math.max(Math.round(item.row), 0),
  }
}

/** Floats every widget up until it touches another one or the top, reading order first. */
export function compact(items: readonly LayoutItem[]): LayoutItem[] {
  const placed: LayoutItem[] = []
  for (const item of [...items].sort(byPosition)) {
    placed.push(floatUp(item, placed))
  }
  return placed
}

/**
 * Keeps `pinned` exactly where it is and pushes whatever it covers down, below
 * it, cascading; then floats the others up. This is the preview while a widget
 * is being dragged or resized: the dragged one is where the pointer is.
 */
function resolve(items: readonly LayoutItem[], pinned: LayoutItem): LayoutItem[] {
  const placed: LayoutItem[] = [pinned]
  const others = items.filter((item) => item.id !== pinned.id).sort(byPosition)
  for (const item of others) {
    let current = item
    let blocker = placed.find((other) => overlaps(current, other))
    while (blocker) {
      current = { ...current, row: bottom(blocker) }
      blocker = placed.find((other) => overlaps(current, other))
    }
    placed.push(floatUp(current, placed))
  }
  return placed
}

function replace(items: readonly LayoutItem[], next: LayoutItem): LayoutItem[] {
  return resolve(items, clampItem(next))
}

/** The drag preview: `id` at (`col`, `row`), the rest pushed out of its way. */
export function moveItem(
  items: readonly LayoutItem[],
  id: WidgetId,
  col: number,
  row: number,
): LayoutItem[] {
  const item = items.find((candidate) => candidate.id === id)
  return item ? replace(items, { ...item, col, row }) : [...items]
}

/** The resize preview: `id` at `w` × `h` cells (never under its minimum, never past the sixth column). */
export function resizeItem(
  items: readonly LayoutItem[],
  id: WidgetId,
  w: number,
  h: number,
): LayoutItem[] {
  const item = items.find((candidate) => candidate.id === id)
  return item ? replace(items, { ...item, w, h }) : [...items]
}

/** The insert preview: `id` (from the catalog) at its initial size with its corner at (`col`, `row`), the rest pushed out of its way. */
export function insertItem(
  items: readonly LayoutItem[],
  id: WidgetId,
  col: number,
  row: number,
): LayoutItem[] {
  const rest = items.filter((item) => item.id !== id)
  return resolve(rest, clampItem({ id, ...WIDGETS[id].initial, col, row }))
}

/** Whether two lists put the same widgets in the same cells, whatever order they are in. */
export function sameItems(a: readonly LayoutItem[], b: readonly LayoutItem[]): boolean {
  const key = (item: LayoutItem) => `${item.id}:${item.col},${item.row},${item.w},${item.h}`
  const left = a.map(key).sort()
  const right = b.map(key).sort()
  return left.length === right.length && left.every((entry, index) => entry === right[index])
}

/** The most cells a key press looks ahead for a move that changes something. */
const MAX_STEP = 24

/**
 * The keyboard move: `id` goes in the direction (`dCol`, `dRow`) as far as it
 * takes for the layout to change once it settles. One cell is often not enough
 * (a widget that moves down floats back up unless it clears the one below).
 * `null` when it cannot go that way.
 */
export function stepItem(
  items: readonly LayoutItem[],
  id: WidgetId,
  dCol: number,
  dRow: number,
): LayoutItem[] | null {
  const item = items.find((candidate) => candidate.id === id)
  if (!item) return null
  for (let step = 1; step <= MAX_STEP; step += 1) {
    const next = settle(moveItem(items, id, item.col + dCol * step, item.row + dRow * step))
    if (!sameItems(next, items)) return next
  }
  return null
}

/** The keyboard resize: one cell wider or taller (or less), settled. `null` when it would not change. */
export function growItem(
  items: readonly LayoutItem[],
  id: WidgetId,
  dW: number,
  dH: number,
): LayoutItem[] | null {
  const item = items.find((candidate) => candidate.id === id)
  if (!item) return null
  const next = settle(resizeItem(items, id, item.w + dW, item.h + dH))
  return sameItems(next, items) ? null : next
}

/** What is committed when a drag or resize ends: everything floats up, the dragged one too. */
export function settle(items: readonly LayoutItem[]): LayoutItem[] {
  return compact(items)
}

/** Takes a widget off the home; what was below it floats up. */
export function removeItem(items: readonly LayoutItem[], id: WidgetId): LayoutItem[] {
  return compact(items.filter((item) => item.id !== id))
}

/** The first free place, reading left to right and top to bottom, for a block of `w` × `h` cells. */
export function findFreeSpot(
  items: readonly LayoutItem[],
  size: CellSize,
): { col: number; row: number } {
  const w = Math.min(size.w, GRID_COLUMNS)
  const last = items.reduce((max, item) => Math.max(max, bottom(item)), 0)
  for (const row of [0, ...new Set(items.map(bottom).sort((a, b) => a - b))]) {
    for (let col = 0; col + w <= GRID_COLUMNS; col += 1) {
      const probe: LayoutItem = { id: 'wealth', col, row, w, h: size.h }
      if (!items.some((item) => overlaps(probe, item))) return { col, row }
    }
  }
  return { col: 0, row: last }
}

/** Puts a widget back on the home, at its initial size, in the first free place. */
export function addItem(items: readonly LayoutItem[], id: WidgetId): LayoutItem[] {
  if (items.some((item) => item.id === id)) return [...items]
  const size = WIDGETS[id].initial
  return compact([...items, { id, ...size, ...findFreeSpot(items, size) }])
}

/** The widgets in the order they are read: row by row, left to right. Where they stack, in this order. */
export function readingOrder(items: readonly LayoutItem[]): LayoutItem[] {
  return [...items].sort(byPosition)
}

/** The widgets that are not on the home: what the catalog offers. */
export function absentWidgets(items: readonly LayoutItem[], all: readonly WidgetId[]): WidgetId[] {
  return all.filter((id) => !items.some((item) => item.id === id))
}

/** One row of a stored layout, if it is a known widget with numbers for a position and a size. */
function parseItem(value: unknown): LayoutItem | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (!isWidgetId(raw.id)) return null
  const numbers = [raw.col, raw.row, raw.w, raw.h]
  if (!numbers.every((number) => typeof number === 'number' && Number.isFinite(number))) return null
  return clampItem({
    id: raw.id,
    col: raw.col as number,
    row: raw.row as number,
    w: raw.w as number,
    h: raw.h as number,
  })
}

/**
 * Reads a stored layout that may be old, from a newer version or damaged:
 * unknown widgets and repeats are dropped, sizes are raised to the minimum and
 * kept inside the grid, overlaps are pushed down and everything floats up.
 * `null` when it is not a layout of a version this code knows, so the caller
 * falls back to the default one.
 */
export function normalizeLayout(raw: unknown): DashboardLayout | null {
  if (typeof raw !== 'object' || raw === null) return null
  const stored = raw as Record<string, unknown>
  if (stored.version !== 1 || !Array.isArray(stored.items)) return null

  const seen = new Set<WidgetId>()
  const items: LayoutItem[] = []
  for (const value of stored.items) {
    const item = parseItem(value)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    items.push(item)
  }

  const placed: LayoutItem[] = []
  for (const item of items.sort(byPosition)) {
    let current = item
    let blocker = placed.find((other) => overlaps(current, other))
    while (blocker) {
      current = { ...current, row: bottom(blocker) }
      blocker = placed.find((other) => overlaps(current, other))
    }
    placed.push(current)
  }
  return { version: 1, items: compact(placed) }
}
