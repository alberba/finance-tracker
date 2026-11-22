/**
 * The widgets of the home (DESIGN.md, «Inicio en escritorio»). Pure data: which
 * widgets exist, what each is called and how small it can get. The components
 * that draw them are matched to these ids in `NeonDashboardSection`.
 *
 * Sizes are in grid cells (six columns, square cells). A minimum is what the
 * content needs to read at the narrowest desktop (a 56rem container, cells of
 * about 132px); below it the widget would clip.
 */
export const WIDGET_IDS = [
  'wealth',
  'month',
  'recent',
  'investments',
  'pending',
  'categories',
  'goals',
] as const

export type WidgetId = (typeof WIDGET_IDS)[number]

export interface CellSize {
  w: number
  h: number
}

export interface WidgetSpec {
  id: WidgetId
  title: string
  /** The smallest it can be resized to. */
  min: CellSize
  /** The default size, including when it is added back from the catalog. */
  initial: CellSize
}

export const WIDGETS: Readonly<Record<WidgetId, WidgetSpec>> = {
  wealth: { id: 'wealth', title: 'Patrimonio', min: { w: 3, h: 2 }, initial: { w: 4, h: 2 } },
  month: { id: 'month', title: 'Te quedan', min: { w: 2, h: 2 }, initial: { w: 2, h: 2 } },
  recent: { id: 'recent', title: 'Movimientos', min: { w: 2, h: 2 }, initial: { w: 2, h: 2 } },
  investments: {
    id: 'investments',
    title: 'Inversiones',
    min: { w: 3, h: 2 },
    initial: { w: 4, h: 2 },
  },
  pending: { id: 'pending', title: 'Por confirmar', min: { w: 2, h: 2 }, initial: { w: 2, h: 2 } },
  categories: {
    id: 'categories',
    title: 'Gasto por categoría',
    min: { w: 2, h: 2 },
    initial: { w: 2, h: 2 },
  },
  goals: { id: 'goals', title: 'Objetivos', min: { w: 2, h: 2 }, initial: { w: 2, h: 2 } },
}

export function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === 'string' && (WIDGET_IDS as readonly string[]).includes(value)
}
