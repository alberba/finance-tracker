import { test, expect } from './fixtures'

test.describe('Finance tracker E2E', () => {
  test('redirige rutas de sección desconocidas al dashboard', async ({ page, tracker }) => {
    await page.goto('/seccion-inexistente')
    await expect(page).toHaveURL(/\/$/)
    await expect(tracker.dashboardSection).toBeVisible()
  })

  // `open` waits for each section's heading; the route is what this adds.
  test('navega por todas las secciones y cada una tiene su ruta', async ({ page, tracker }) => {
    const sections = [
      { open: () => tracker.openDashboard(), path: /\/$/ },
      { open: () => tracker.openTransactions(), path: /\/movimientos$/ },
      { open: () => tracker.openBudget(), path: /\/presupuesto$/ },
      { open: () => tracker.openWealth(), path: /\/patrimonio$/ },
      { open: () => tracker.openInvestment(), path: /\/inversion$/ },
      { open: () => tracker.openGoals(), path: /\/objetivos$/ },
      { open: () => tracker.openSettings(), path: /\/configuracion$/ },
      { open: () => tracker.openData(), path: /\/datos$/ },
    ]

    for (const section of sections) {
      await section.open()
      await expect(page).toHaveURL(section.path)
    }
  })
})
