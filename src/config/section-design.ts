import type { Design } from '../lib/design'
import type { SectionId } from '../scripts/types'

/**
 * Which sections the new design already paints (ADR 0010, the «decisión de
 * diseño por sección» seam). With the toggle on «nuevo», a section in this list
 * mounts its version from `src/neon/`; any other one keeps its old content
 * inside the new frame. With «antiguo», every section is the old one. The
 * migration's last ticket deletes this file.
 */
export const MIGRATED_SECTIONS: readonly SectionId[] = [
  'dashboard',
  'transactions',
  'budget',
  'wealth',
  'investment',
  'goals',
  'settings',
  'data',
]

export function sectionDesign(section: SectionId, design: Design): Design {
  return design === 'neon' && MIGRATED_SECTIONS.includes(section) ? 'neon' : 'legacy'
}
