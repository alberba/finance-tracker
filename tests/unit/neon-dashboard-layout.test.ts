import { describe, expect, it } from 'vitest'

import { defaultLayout } from '../../src/neon/dashboard/layout/default-layout'
import {
  GRID_COLUMNS,
  absentWidgets,
  addItem,
  compact,
  findFreeSpot,
  growItem,
  insertItem,
  moveItem,
  normalizeLayout,
  overlaps,
  readingOrder,
  removeItem,
  resizeItem,
  settle,
  sameItems,
  setChartSide,
  stepItem,
  type LayoutItem,
} from '../../src/neon/dashboard/layout/engine'
import {
  cornerOffset,
  grabOffset,
  gridMetrics,
  moveTarget,
  overGrid,
  resizeTarget,
} from '../../src/neon/dashboard/layout/geometry'
import { WIDGETS, WIDGET_IDS, isWidgetId } from '../../src/neon/dashboard/layout/widgets'
import { fitCount } from '../../src/neon/ui/fit-list'

const item = (
  id: LayoutItem['id'],
  col: number,
  row: number,
  w: number,
  h: number,
): LayoutItem => ({
  id,
  col,
  row,
  w,
  h,
})

const byId = (items: readonly LayoutItem[], id: LayoutItem['id']) =>
  items.find((candidate) => candidate.id === id)

function expectValid(items: readonly LayoutItem[]): void {
  for (const [index, a] of items.entries()) {
    expect(a.col).toBeGreaterThanOrEqual(0)
    expect(a.col + a.w).toBeLessThanOrEqual(GRID_COLUMNS)
    expect(a.row).toBeGreaterThanOrEqual(0)
    expect(a.w).toBeGreaterThanOrEqual(WIDGETS[a.id].min.w)
    expect(a.h).toBeGreaterThanOrEqual(WIDGETS[a.id].min.h)
    for (const b of items.slice(index + 1)) expect(overlaps(a, b), `${a.id} / ${b.id}`).toBe(false)
  }
}

describe('widgets registry', () => {
  it('knows every widget and only those', () => {
    expect(WIDGET_IDS.every((id) => WIDGETS[id].id === id)).toBe(true)
    expect(isWidgetId('wealth')).toBe(true)
    expect(isWidgetId('weather')).toBe(false)
    expect(isWidgetId(3)).toBe(false)
  })

  it('starts each widget at a size that is not under its minimum', () => {
    for (const id of WIDGET_IDS) {
      expect(WIDGETS[id].initial.w).toBeGreaterThanOrEqual(WIDGETS[id].min.w)
      expect(WIDGETS[id].initial.h).toBeGreaterThanOrEqual(WIDGETS[id].min.h)
    }
  })
})

describe('default layout', () => {
  it('starts every widget at two cells high in a valid, compact grid', () => {
    const { items } = defaultLayout()
    expect(items.map((entry) => entry.id).sort()).toEqual([...WIDGET_IDS].sort())
    expectValid(items)
    expect(items).toEqual([
      item('wealth', 0, 0, 4, 2),
      item('month', 4, 0, 2, 2),
      item('recent', 0, 2, 2, 2),
      item('investments', 2, 2, 4, 2),
      item('pending', 0, 4, 2, 2),
      item('categories', 2, 4, 2, 2),
      item('goals', 4, 4, 2, 2),
    ])
    expect(compact(items)).toEqual(readingOrder(items))
  })

  it('reads net worth, «Te quedan», movements, investments, pending, categories, goals', () => {
    expect(readingOrder(defaultLayout().items).map((entry) => entry.id)).toEqual([
      'wealth',
      'month',
      'recent',
      'investments',
      'pending',
      'categories',
      'goals',
    ])
  })

  it('is a fresh copy every time', () => {
    expect(defaultLayout()).not.toBe(defaultLayout())
    expect(defaultLayout()).toEqual(defaultLayout())
  })
})

describe('compact', () => {
  it('floats a widget up until the top or another widget stops it', () => {
    const result = compact([item('wealth', 0, 4, 3, 3), item('recent', 0, 9, 3, 2)])
    expect(byId(result, 'wealth')?.row).toBe(0)
    expect(byId(result, 'recent')?.row).toBe(3)
  })

  it('leaves empty cells to the side', () => {
    const result = compact([item('wealth', 0, 0, 3, 3), item('recent', 4, 5, 2, 2)])
    expect(byId(result, 'recent')).toMatchObject({ col: 4, row: 0 })
  })

  it('does not jump over a widget into a hole above it', () => {
    const result = compact([
      item('wealth', 0, 0, 6, 1 + 2),
      item('month', 0, 4, 3, 3),
      item('recent', 3, 4, 3, 3),
    ])
    expect(byId(result, 'month')?.row).toBe(3)
    expect(byId(result, 'recent')?.row).toBe(3)
  })
})

describe('moveItem', () => {
  const start = defaultLayout().items

  it('keeps the dragged widget where it is dropped and pushes what it covers down', () => {
    const result = moveItem(start, 'goals', 0, 0)
    expect(byId(result, 'goals')).toMatchObject({ col: 0, row: 0 })
    expect(byId(result, 'wealth')!.row).toBeGreaterThanOrEqual(2)
    expectValid(result)
  })

  it('clamps the column so the widget stays inside the six', () => {
    expect(byId(moveItem(start, 'wealth', 5, 0), 'wealth')).toMatchObject({ col: 2, w: 4 })
    expect(byId(moveItem(start, 'wealth', -4, 0), 'wealth')!.col).toBe(0)
  })

  it('never goes above the first row', () => {
    expect(byId(moveItem(start, 'recent', 0, -3), 'recent')!.row).toBe(0)
  })

  it('floats the others up into the place the dragged widget left', () => {
    const result = moveItem(start, 'wealth', 0, 12)
    expect(byId(result, 'recent')!.row).toBeLessThan(3)
    expectValid(result)
  })

  it('settles the dragged widget up too when the drop ends', () => {
    const preview = moveItem(start, 'wealth', 0, 12)
    expect(byId(preview, 'wealth')!.row).toBe(12)
    expect(byId(settle(preview), 'wealth')!.row).toBeLessThan(12)
  })

  it('returns the same widgets for an id that is not on the home', () => {
    const without = start.filter((entry) => entry.id !== 'goals')
    expect(moveItem(without, 'goals', 0, 0)).toEqual(without)
  })

  it('does not change the list it was given', () => {
    const copy = structuredClone(start)
    moveItem(start, 'goals', 0, 0)
    expect(start).toEqual(copy)
  })
})

describe('resizeItem', () => {
  const start = defaultLayout().items

  it('pushes the widgets below down when one grows over them', () => {
    const result = resizeItem(start, 'wealth', 3, 5)
    expect(byId(result, 'wealth')).toMatchObject({ w: 3, h: 5 })
    expect(byId(result, 'recent')!.row).toBeGreaterThanOrEqual(5)
    expectValid(result)
  })

  it('pushes a neighbour down when growing wider into it', () => {
    const result = resizeItem(start, 'wealth', 5, 3)
    expect(byId(result, 'wealth')!.w).toBe(5)
    expect(byId(result, 'month')!.row).toBeGreaterThanOrEqual(3)
    expectValid(result)
  })

  it('stops at the minimum size of the widget', () => {
    expect(byId(resizeItem(start, 'wealth', 1, 1), 'wealth')).toMatchObject({ w: 3, h: 2 })
    expect(byId(resizeItem(start, 'goals', 1, 1), 'goals')).toMatchObject({ w: 2, h: 2 })
  })

  it('stops at the sixth column', () => {
    expect(byId(resizeItem(start, 'month', 9, 3), 'month')).toMatchObject({ col: 0, w: 6 })
  })
})

describe('removeItem and addItem', () => {
  const start = defaultLayout().items

  it('floats the widgets below up when one is removed', () => {
    const result = removeItem(start, 'wealth')
    expect(byId(result, 'wealth')).toBeUndefined()
    expect(byId(result, 'recent')!.row).toBe(0)
    expectValid(result)
  })

  it('can empty the home', () => {
    const empty = WIDGET_IDS.reduce((items, id) => removeItem(items, id), start)
    expect(empty).toEqual([])
    expect(absentWidgets(empty, WIDGET_IDS)).toEqual([...WIDGET_IDS])
  })

  it('lists what the catalog offers: the widgets that are not on the home', () => {
    expect(absentWidgets(removeItem(start, 'goals'), WIDGET_IDS)).toEqual(['goals'])
  })

  it('adds a widget back at its initial size in the first free place', () => {
    const removed = removeItem(removeItem(start, 'goals'), 'categories')
    const result = addItem(removed, 'categories')
    expect(byId(result, 'categories')).toMatchObject({
      w: WIDGETS.categories.initial.w,
      h: WIDGETS.categories.initial.h,
    })
    expectValid(result)
  })

  it('puts it at the bottom when there is no gap to fill', () => {
    const removed = removeItem(start, 'goals')
    const result = addItem(removed, 'goals')
    expect(byId(result, 'goals')).toMatchObject({ col: 4, row: 4 })
  })

  it('adds nothing twice', () => {
    expect(addItem(start, 'wealth')).toEqual(start)
  })

  it('finds a free place beside a widget before going under all of them', () => {
    expect(findFreeSpot([item('wealth', 0, 0, 3, 3)], { w: 3, h: 3 })).toEqual({ col: 3, row: 0 })
    expect(findFreeSpot([item('wealth', 0, 0, 4, 3)], { w: 3, h: 3 })).toEqual({ col: 0, row: 3 })
    expect(findFreeSpot([], { w: 2, h: 2 })).toEqual({ col: 0, row: 0 })
  })
})

describe('readingOrder', () => {
  it('reads row by row, left to right', () => {
    const ids = readingOrder([
      item('goals', 4, 3, 2, 2),
      item('wealth', 0, 0, 3, 3),
      item('recent', 0, 3, 3, 2),
      item('month', 3, 0, 3, 3),
    ]).map((entry) => entry.id)
    expect(ids).toEqual(['wealth', 'month', 'recent', 'goals'])
  })
})

describe('normalizeLayout', () => {
  it('compacts a saved widget far below the grid without walking every empty row', () => {
    const layout = normalizeLayout({
      version: 1,
      items: [{ id: 'goals', col: 0, row: 1_000_000_000, w: 2, h: 3 }],
    })
    expect(layout?.items).toEqual([{ id: 'goals', col: 0, row: 0, w: 2, h: 3 }])
  })

  it('keeps a valid layout as it is', () => {
    const layout = defaultLayout()
    expect(normalizeLayout(layout)).toEqual({ ...layout, items: readingOrder(layout.items) })
  })

  it('accepts an empty home', () => {
    expect(normalizeLayout({ version: 1, items: [] })).toEqual({ version: 1, items: [] })
  })

  it('is null when it is not a layout this version reads', () => {
    for (const raw of [
      null,
      undefined,
      4,
      'x',
      [],
      {},
      { version: 2, items: [] },
      { version: 1 },
    ]) {
      expect(normalizeLayout(raw)).toBeNull()
    }
  })

  it('drops widgets that do not exist and rows that are not rows', () => {
    const result = normalizeLayout({
      version: 1,
      items: [
        item('wealth', 0, 0, 3, 3),
        { id: 'weather', col: 3, row: 0, w: 3, h: 3 },
        { id: 'goals', col: 'a', row: 0, w: 2, h: 2 },
        { id: 'month', col: 3, row: 0, w: Number.NaN, h: 3 },
        null,
        7,
      ],
    })
    expect(result?.items.map((entry) => entry.id)).toEqual(['wealth'])
  })

  it('keeps the first of a repeated widget', () => {
    const result = normalizeLayout({
      version: 1,
      items: [item('wealth', 0, 0, 3, 3), item('wealth', 3, 0, 3, 3)],
    })
    expect(result?.items).toEqual([item('wealth', 0, 0, 3, 3)])
  })

  it('raises a size to the minimum and keeps it inside the grid', () => {
    const result = normalizeLayout({
      version: 1,
      items: [item('wealth', 5, 0, 1, 1), item('goals', -3, 9, 40, 2.4)],
    })
    expect(result).not.toBeNull()
    expectValid(result!.items)
    expect(byId(result!.items, 'wealth')).toMatchObject({ w: 3, h: 2, col: 3 })
    expect(byId(result!.items, 'goals')).toMatchObject({ col: 0, w: 6, h: 2 })
  })

  it('pushes overlaps down and floats everything up', () => {
    const result = normalizeLayout({
      version: 1,
      items: [item('wealth', 0, 0, 3, 3), item('month', 1, 1, 3, 3), item('recent', 0, 40, 3, 3)],
    })
    expectValid(result!.items)
    expect(byId(result!.items, 'month')!.row).toBeGreaterThanOrEqual(3)
    expect(byId(result!.items, 'recent')!.row).toBeLessThan(10)
  })
})

describe('fitCount', () => {
  it('counts the rows whose bottom edge is inside the room', () => {
    expect(fitCount([60, 120, 180, 240], 200)).toBe(3)
    expect(fitCount([60, 120, 180, 240], 240)).toBe(4)
    expect(fitCount([60, 120], 59)).toBe(0)
  })

  it('forgives half a pixel of rounding', () => {
    expect(fitCount([60.4, 120.4], 120)).toBe(2)
    expect(fitCount([60, 121], 120)).toBe(1)
  })

  it('stops at the first row that does not fit', () => {
    expect(fitCount([60, 200, 100], 150)).toBe(1)
  })

  it('shows an empty list as empty', () => {
    expect(fitCount([], 100)).toBe(0)
  })
})

describe('insertItem', () => {
  it('puts a widget from the catalog at its initial size, the rest pushed out of its way', () => {
    const without = removeItem(defaultLayout().items, 'wealth')
    const result = insertItem(without, 'wealth', 0, 0)
    expect(byId(result, 'wealth')).toMatchObject({ col: 0, row: 0, w: 4, h: 2 })
    expectValid(result)
  })

  it('clamps it into the grid', () => {
    const result = insertItem([], 'goals', 9, -2)
    expect(byId(result, 'goals')).toMatchObject({ col: 4, row: 0 })
  })

  it('does not repeat a widget that is already there', () => {
    const result = insertItem(defaultLayout().items, 'wealth', 3, 0)
    expect(result.filter((entry) => entry.id === 'wealth')).toHaveLength(1)
    expectValid(result)
  })
})

describe('stepItem (the keyboard move)', () => {
  const start = defaultLayout().items

  it('moves down as far as it takes to change something, which is past the widget below', () => {
    const result = stepItem(start, 'wealth', 0, 1)!
    expect(byId(result, 'wealth')!.row).toBeGreaterThanOrEqual(2)
    expect(byId(result, 'recent')!.row).toBe(0)
    expectValid(result)
  })

  it('moves a widget sideways into free cells one at a time', () => {
    const lonely = [item('goals', 0, 0, 2, 2)]
    expect(byId(stepItem(lonely, 'goals', 1, 0)!, 'goals')!.col).toBe(1)
  })

  it('cannot go past the edge or above the first row', () => {
    expect(stepItem(start, 'wealth', -1, 0)).toBeNull()
    expect(stepItem(start, 'wealth', 0, -1)).toBeNull()
    expect(stepItem([item('month', 3, 0, 3, 3)], 'month', 1, 0)).toBeNull()
  })

  it('does nothing for a widget that is not there', () => {
    expect(stepItem([], 'wealth', 1, 0)).toBeNull()
  })

  it('keeps the layout valid whatever the direction', () => {
    for (const id of WIDGET_IDS) {
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const result = stepItem(start, id, dc, dr)
        if (result) expectValid(result)
      }
    }
  })
})

describe('growItem (the keyboard resize)', () => {
  const start = defaultLayout().items

  it('grows and shrinks one cell at a time', () => {
    expect(byId(growItem(start, 'recent', 0, 1)!, 'recent')).toMatchObject({ w: 2, h: 3 })
    const wider = growItem(start, 'recent', 1, 0)!
    expect(byId(wider, 'recent')).toMatchObject({ w: 3, h: 2 })
    expect(byId(growItem(wider, 'recent', -1, 0)!, 'recent')).toMatchObject({ w: 2, h: 2 })
  })

  it('stops at the minimum, and at the sixth column', () => {
    expect(growItem(start, 'month', -1, 0)).toBeNull()
    expect(growItem(start, 'wealth', 0, -1)).toBeNull()
    expect(growItem([item('month', 0, 0, 6, 3)], 'month', 1, 0)).toBeNull()
  })

  it('pushes what is in the way', () => {
    const result = growItem(start, 'wealth', 1, 0)!
    expect(byId(result, 'wealth')!.w).toBe(5)
    expect(byId(result, 'month')!.row).toBeGreaterThan(0)
    expectValid(result)
  })
})

describe('grid geometry', () => {
  // A grid 1141px wide with a 20px gap: cells of (1141 − 100) / 6.
  const metrics = gridMetrics({ left: 268, top: 400, width: 1141 }, 20)

  it('measures the cell from the width and the gap', () => {
    expect(metrics.cell).toBeCloseTo(173.5, 1)
    expect(metrics.pitch).toBeCloseTo(193.5, 1)
  })

  it('puts the dragged widget in the cell it is nearest to, keeping where it was grabbed', () => {
    const widget = item('goals', 4, 2, 2, 3)
    const left = 268 + 4 * metrics.pitch
    const top = 400 + 2 * metrics.pitch
    const grab = grabOffset(metrics, { x: left + 50, y: top + 30 }, widget)
    expect(grab).toEqual({ x: 50, y: 30 })
    expect(moveTarget(metrics, { x: left + 50, y: top + 30 }, grab)).toEqual({ col: 4, row: 2 })
    expect(moveTarget(metrics, { x: left + 50 - metrics.pitch, y: top + 30 }, grab).col).toBe(3)
    expect(moveTarget(metrics, { x: left + 50, y: top + 30 + 2 * metrics.pitch }, grab).row).toBe(4)
    // Less than half a cell away still snaps back.
    expect(moveTarget(metrics, { x: left + 50 + metrics.pitch * 0.4, y: top + 30 }, grab).col).toBe(
      4,
    )
  })

  it('resizes from the bottom-right corner, in whole cells', () => {
    const widget = item('wealth', 0, 0, 3, 3)
    const corner = { x: 268 + 3 * metrics.pitch - 20, y: 400 + 3 * metrics.pitch - 20 }
    const grab = cornerOffset(metrics, { x: corner.x - 6, y: corner.y - 4 }, widget)
    expect(grab).toEqual({ x: -6, y: -4 })
    expect(resizeTarget(metrics, { x: corner.x - 6, y: corner.y - 4 }, grab, widget)).toEqual({
      w: 3,
      h: 3,
    })
    expect(
      resizeTarget(metrics, { x: corner.x - 6 + metrics.pitch, y: corner.y - 4 }, grab, widget),
    ).toEqual({ w: 4, h: 3 })
    expect(
      resizeTarget(metrics, { x: corner.x - 6, y: corner.y - 4 - metrics.pitch }, grab, widget),
    ).toEqual({ w: 3, h: 2 })
  })

  it('knows when the pointer is over the grid', () => {
    expect(overGrid(metrics, { x: 300, y: 500 })).toBe(true)
    expect(overGrid(metrics, { x: 100, y: 500 })).toBe(false)
    expect(overGrid(metrics, { x: 300, y: 300 })).toBe(false)
    expect(overGrid(metrics, { x: 268 + 6 * metrics.pitch, y: 500 })).toBe(false)
  })
})

describe('sameItems', () => {
  it('compares widgets and cells, not the order of the list or of the keys', () => {
    const a = [item('wealth', 0, 0, 3, 3), item('goals', 3, 0, 2, 3)]
    const b = [{ w: 2, h: 3, row: 0, col: 3, id: 'goals' as const }, ...a.slice(0, 1)]
    expect(sameItems(a, b)).toBe(true)
    expect(sameItems(a, [item('wealth', 0, 0, 3, 3)])).toBe(false)
    expect(sameItems(a, [a[0], item('goals', 3, 0, 2, 4)])).toBe(false)
  })
})

describe('chart side', () => {
  it('keeps the chart after the figures through moves, and only for widgets with a chart', () => {
    const items = setChartSide(defaultLayout().items, 'wealth', 'end')
    expect(items.find((entry) => entry.id === 'wealth')?.chart).toBe('end')
    expect(sameItems(items, defaultLayout().items)).toBe(false)
    const moved = settle(moveItem(items, 'wealth', 2, 4))
    expect(moved.find((entry) => entry.id === 'wealth')?.chart).toBe('end')
    expect(
      setChartSide(items, 'wealth', 'start').find((entry) => entry.id === 'wealth'),
    ).not.toHaveProperty('chart')
  })

  it('reads the side back from storage and ignores it where it does not apply', () => {
    const layout = normalizeLayout({
      version: 1,
      items: [
        { id: 'investments', col: 0, row: 0, w: 4, h: 2, chart: 'end' },
        { id: 'goals', col: 4, row: 0, w: 2, h: 2, chart: 'end' },
        { id: 'wealth', col: 0, row: 2, w: 4, h: 2, chart: 'sideways' },
      ],
    })
    expect(layout?.items.map((entry) => entry.chart)).toEqual(['end', undefined, undefined])
  })
})
