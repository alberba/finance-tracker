import type { DashboardLayout } from './engine'
import { WIDGETS, type WidgetId } from './widgets'

const defaultRows: readonly (readonly WidgetId[])[] = [
  ['wealth', 'month'],
  ['recent', 'investments'],
  ['pending', 'categories', 'goals'],
]

/** The initial dashboard and the layout restored by «Restablecer». */
export function defaultLayout(): DashboardLayout {
  const items: DashboardLayout['items'] = []
  let row = 0
  for (const ids of defaultRows) {
    let col = 0
    let height = 0
    for (const id of ids) {
      const { w, h } = WIDGETS[id].initial
      items.push({ id, col, row, w, h })
      col += w
      height = Math.max(height, h)
    }
    row += height
  }
  return { version: 1, items }
}
