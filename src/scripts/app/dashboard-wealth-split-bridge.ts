/**
 * Puente entre el controlador imperativo del dashboard y la isla Vue
 * `DashboardWealthSplitPanel`.
 */

const WEALTH_SPLIT_EVENT = 'dashboard:wealth-split'

export interface DashboardWealthSplitItem {
  label: string
  color: string
  value: number
  amount: string
  pct: string
}

declare global {
  interface WindowEventMap {
    'dashboard:wealth-split': CustomEvent<DashboardWealthSplitItem[]>
  }
  interface Window {
    __dashboardWealthSplit?: DashboardWealthSplitItem[]
  }
}

export function publishDashboardWealthSplit(items: DashboardWealthSplitItem[]): void {
  window.__dashboardWealthSplit = items
  window.dispatchEvent(new CustomEvent(WEALTH_SPLIT_EVENT, { detail: items }))
}

export function subscribeDashboardWealthSplit(
  handler: (items: DashboardWealthSplitItem[]) => void,
): () => void {
  if (window.__dashboardWealthSplit) {
    handler(window.__dashboardWealthSplit)
  }
  const listener = (event: WindowEventMap[typeof WEALTH_SPLIT_EVENT]) => {
    handler(event.detail)
  }
  window.addEventListener(WEALTH_SPLIT_EVENT, listener)
  return () => window.removeEventListener(WEALTH_SPLIT_EVENT, listener)
}
