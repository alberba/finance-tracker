import type { DashboardHeroRange, DashboardViewModel } from './dashboard-view-model'
import type { SectionId } from '../types'

const DASHBOARD_VIEW_MODEL_EVENT = 'dashboard:view-model'
const DASHBOARD_MONTH_CHANGE_EVENT = 'dashboard:month-change'
const DASHBOARD_YEAR_CHANGE_EVENT = 'dashboard:year-change'
const DASHBOARD_RANGE_CHANGE_EVENT = 'dashboard:range-change'
const DASHBOARD_NAVIGATE_EVENT = 'dashboard:navigate'

// Adapter between the imperative app controller and the Vue dashboard composable.
type DashboardViewModelSubscriber = (viewModel: DashboardViewModel) => void
type DashboardEventName =
  | typeof DASHBOARD_VIEW_MODEL_EVENT
  | typeof DASHBOARD_MONTH_CHANGE_EVENT
  | typeof DASHBOARD_YEAR_CHANGE_EVENT
  | typeof DASHBOARD_RANGE_CHANGE_EVENT
  | typeof DASHBOARD_NAVIGATE_EVENT
type DashboardEventDetail<TEventName extends DashboardEventName> =
  WindowEventMap[TEventName] extends CustomEvent<infer Detail> ? Detail : never
type Unsubscribe = () => void

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

function getLatestDashboardViewModel(): DashboardViewModel | undefined {
  return window.__dashboardViewModel
}

function setLatestDashboardViewModel(viewModel: DashboardViewModel): void {
  window.__dashboardViewModel = viewModel
}

function dispatchDashboardEvent<TEventName extends DashboardEventName>(
  eventName: TEventName,
  detail: DashboardEventDetail<TEventName>,
): void {
  window.dispatchEvent(new CustomEvent(eventName, { detail }))
}

function subscribeToDashboardEvent<TEventName extends DashboardEventName>(
  eventName: TEventName,
  listener: (detail: DashboardEventDetail<TEventName>) => void,
): Unsubscribe {
  const eventListener = (event: WindowEventMap[TEventName]) => {
    listener(event.detail as DashboardEventDetail<TEventName>)
  }
  window.addEventListener(eventName, eventListener)
  return () => window.removeEventListener(eventName, eventListener)
}

export function publishDashboardViewModel(viewModel: DashboardViewModel): void {
  setLatestDashboardViewModel(viewModel)
  dispatchDashboardEvent(DASHBOARD_VIEW_MODEL_EVENT, viewModel)
}

export function subscribeDashboardViewModel(
  subscriber: DashboardViewModelSubscriber,
): Unsubscribe {
  const currentViewModel = getLatestDashboardViewModel()
  if (currentViewModel) {
    subscriber(currentViewModel)
  }
  return subscribeToDashboardEvent(DASHBOARD_VIEW_MODEL_EVENT, subscriber)
}

export function requestDashboardMonthChange(month: number): void {
  dispatchDashboardEvent(DASHBOARD_MONTH_CHANGE_EVENT, month)
}

export function onDashboardMonthChange(listener: (month: number) => void): Unsubscribe {
  return subscribeToDashboardEvent(DASHBOARD_MONTH_CHANGE_EVENT, listener)
}

export function requestDashboardYearChange(year: number): void {
  dispatchDashboardEvent(DASHBOARD_YEAR_CHANGE_EVENT, year)
}

export function onDashboardYearChange(listener: (year: number) => void): Unsubscribe {
  return subscribeToDashboardEvent(DASHBOARD_YEAR_CHANGE_EVENT, listener)
}

export function requestDashboardRangeChange(range: DashboardHeroRange): void {
  dispatchDashboardEvent(DASHBOARD_RANGE_CHANGE_EVENT, range)
}

export function onDashboardRangeChange(
  listener: (range: DashboardHeroRange) => void,
): Unsubscribe {
  return subscribeToDashboardEvent(DASHBOARD_RANGE_CHANGE_EVENT, listener)
}

export function requestDashboardNavigation(sectionId: SectionId): void {
  dispatchDashboardEvent(DASHBOARD_NAVIGATE_EVENT, sectionId)
}

export function onDashboardNavigation(listener: (sectionId: SectionId) => void): Unsubscribe {
  return subscribeToDashboardEvent(DASHBOARD_NAVIGATE_EVENT, listener)
}
