import type { DashboardHeroRange, DashboardViewModel } from './dashboard-view-model'
import type { SectionId } from '../types'

const DASHBOARD_VIEW_MODEL_EVENT = 'dashboard:view-model'
const DASHBOARD_MONTH_CHANGE_EVENT = 'dashboard:month-change'
const DASHBOARD_YEAR_CHANGE_EVENT = 'dashboard:year-change'
const DASHBOARD_RANGE_CHANGE_EVENT = 'dashboard:range-change'
const DASHBOARD_NAVIGATE_EVENT = 'dashboard:navigate'

// Adapter between the imperative app controller and the Vue dashboard composable.
declare global {
  interface WindowEventMap {
    'dashboard:view-model': CustomEvent<DashboardViewModel>
    'dashboard:month-change': CustomEvent<number>
    'dashboard:year-change': CustomEvent<number>
    'dashboard:range-change': CustomEvent<DashboardHeroRange>
    'dashboard:navigate': CustomEvent<SectionId>
  }
  interface Window {
    __dashboardViewModel?: DashboardViewModel
  }
}

export function publishDashboardViewModel(viewModel: DashboardViewModel): void {
  window.__dashboardViewModel = viewModel
  window.dispatchEvent(new CustomEvent(DASHBOARD_VIEW_MODEL_EVENT, { detail: viewModel }))
}

export function subscribeDashboardViewModel(
  handler: (viewModel: DashboardViewModel) => void,
): () => void {
  if (window.__dashboardViewModel) {
    handler(window.__dashboardViewModel)
  }
  const listener = (event: WindowEventMap[typeof DASHBOARD_VIEW_MODEL_EVENT]) => {
    handler(event.detail)
  }
  window.addEventListener(DASHBOARD_VIEW_MODEL_EVENT, listener)
  return () => window.removeEventListener(DASHBOARD_VIEW_MODEL_EVENT, listener)
}

export function requestDashboardMonthChange(month: number): void {
  window.dispatchEvent(new CustomEvent(DASHBOARD_MONTH_CHANGE_EVENT, { detail: month }))
}

export function onDashboardMonthChange(handler: (month: number) => void): void {
  window.addEventListener(DASHBOARD_MONTH_CHANGE_EVENT, (event) => {
    handler(event.detail)
  })
}

export function requestDashboardYearChange(year: number): void {
  window.dispatchEvent(new CustomEvent(DASHBOARD_YEAR_CHANGE_EVENT, { detail: year }))
}

export function onDashboardYearChange(handler: (year: number) => void): void {
  window.addEventListener(DASHBOARD_YEAR_CHANGE_EVENT, (event) => {
    handler(event.detail)
  })
}

export function requestDashboardRangeChange(range: DashboardHeroRange): void {
  window.dispatchEvent(new CustomEvent(DASHBOARD_RANGE_CHANGE_EVENT, { detail: range }))
}

export function onDashboardRangeChange(handler: (range: DashboardHeroRange) => void): void {
  window.addEventListener(DASHBOARD_RANGE_CHANGE_EVENT, (event) => {
    handler(event.detail)
  })
}

export function requestDashboardNavigation(sectionId: SectionId): void {
  window.dispatchEvent(new CustomEvent(DASHBOARD_NAVIGATE_EVENT, { detail: sectionId }))
}

export function onDashboardNavigation(handler: (sectionId: SectionId) => void): void {
  window.addEventListener(DASHBOARD_NAVIGATE_EVENT, (event) => {
    handler(event.detail)
  })
}
