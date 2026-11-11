import { test, expect } from './fixtures'
import type { FinanceSectionId } from './pages/FinanceTrackerPage'

/**
 * Smoke test of the old design while it coexists with the new one (ADR 0010):
 * with the toggle on «antiguo» (the cookie the suite starts with), each section
 * opens and shows its heading. The rest of the old design's coverage stays in
 * the specs written for it.
 */
const SECTION_IDS: FinanceSectionId[] = [
  'dashboard',
  'transactions',
  'budget',
  'wealth',
  'investment',
  'goals',
  'settings',
  'data',
]

test('con el toggle en antiguo, cada sección abre y muestra su encabezado', async ({
  page,
  tracker,
}) => {
  await expect(page.locator('html')).toHaveAttribute('data-ui', 'legacy')
  await expect(page.locator('#sidebar-toggle')).toBeVisible()

  for (const id of SECTION_IDS) await tracker.open(id)

  // Datos is the last one opened: the old design keeps its own title.
  await expect(
    tracker.section('data').getByRole('heading', { name: 'Datos y backups' }),
  ).toBeVisible()
})
