/**
 * Puente entre el controlador imperativo del dashboard y la isla Vue
 * `TopExpenseList`. Ambos viven en bundles distintos (script de página vs.
 * isla hidratada), por lo que no comparten estado de módulo: la comunicación
 * se hace con un CustomEvent en `window` y una caché del último valor para que
 * la isla reciba los datos aunque se monte después de la primera publicación.
 */

const TOP_EXPENSES_EVENT = 'dashboard:top-expenses'

export interface TopExpenseItem {
  /** Categoría del gasto, usada también como clave de lista. */
  category: string
  emoji: string
  /** Importe ya formateado (p. ej. "1.234,56 €"). */
  amount: string
  /** Porcentaje ya formateado (p. ej. "23,4%"). */
  pct: string
  /** Porcentaje numérico (0-100), usado para la barra de progreso. */
  pctValue: number
}

declare global {
  interface WindowEventMap {
    'dashboard:top-expenses': CustomEvent<TopExpenseItem[]>
  }
  interface Window {
    __dashboardTopExpenses?: TopExpenseItem[]
  }
}

export function publishTopExpenses(items: TopExpenseItem[]): void {
  window.__dashboardTopExpenses = items
  window.dispatchEvent(new CustomEvent(TOP_EXPENSES_EVENT, { detail: items }))
}

/** Suscribe un handler a las actualizaciones y devuelve la función de limpieza. */
export function subscribeTopExpenses(
  handler: (items: TopExpenseItem[]) => void,
): () => void {
  if (window.__dashboardTopExpenses) {
    handler(window.__dashboardTopExpenses)
  }
  const listener = (event: WindowEventMap[typeof TOP_EXPENSES_EVENT]) => {
    handler(event.detail)
  }
  window.addEventListener(TOP_EXPENSES_EVENT, listener)
  return () => window.removeEventListener(TOP_EXPENSES_EVENT, listener)
}
