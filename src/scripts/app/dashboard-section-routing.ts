import { ROUTE_SECTION_MAP, SECTION_ROUTE_MAP, isSectionId, type SectionId } from '../types'

/** «Mis reportes» vive fuera de `APP_SECTIONS`: es una página propia (#340). */
export const REPORTS_ROUTE = '/reportes'

export function isReportsPath(pathname: string): boolean {
  return normalizePath(pathname) === REPORTS_ROUTE
}

export function getSectionFromPath(pathname: string): SectionId {
  const normalizedPath = normalizePath(pathname)
  if (normalizedPath === '/') {
    return 'dashboard'
  }

  return ROUTE_SECTION_MAP[normalizedPath] || 'dashboard'
}

export function isSectionRoutePath(pathname: string): boolean {
  return Object.prototype.hasOwnProperty.call(ROUTE_SECTION_MAP, normalizePath(pathname))
}

export function getPathFromSection(sectionId: SectionId | string) {
  return SECTION_ROUTE_MAP[normalizeSectionId(sectionId)] || '/dashboard'
}

export function normalizeSectionId(sectionId: unknown): SectionId {
  if (typeof sectionId === 'string' && isSectionId(sectionId)) {
    return sectionId
  }

  return 'dashboard'
}

function normalizePath(pathname: unknown) {
  if (typeof pathname !== 'string' || pathname.length === 0) {
    return '/'
  }

  const trimmed = pathname.replace(/\/+$/, '')
  return trimmed || '/'
}
