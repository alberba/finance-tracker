import { getPathFromSection } from '../scripts/app/dashboard-section-routing'
import type { SectionId } from '../scripts/types'

/**
 * Moves the app to another section the way a nav click does: pushes its
 * route and lets the shell's popstate listener switch the section.
 */
export function useSectionNavigation() {
  function navigateTo(sectionId: SectionId): void {
    window.history.pushState(null, '', getPathFromSection(sectionId))
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  /** «Mis reportes» vive fuera de `APP_SECTIONS`: su ruta la resuelve el shell. */
  function navigateToReports(issueNumber?: number): void {
    const query = issueNumber ? `?reporte=${issueNumber}` : ''
    window.history.pushState(null, '', `/reportes${query}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  return { navigateTo, navigateToReports }
}
