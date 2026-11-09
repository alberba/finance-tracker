import { test, expect } from './fixtures'

test.describe('Finance tracker E2E', () => {
  test('redirige rutas de sección desconocidas al dashboard', async ({ page }) => {
    await page.goto('/seccion-inexistente')
    await expect(page).toHaveURL(/\/$/)
    await expect(
      page.locator('#dashboard').getByRole('heading', {
        name: 'Dashboard',
        exact: true,
      }),
    ).toBeVisible()
  })

  test('navega por todas las tabs principales y mantiene su heading visible', async ({
    page,
    tracker,
  }) => {
    const tabs = [
      {
        open: () => tracker.openDashboard(),
        path: /\/$/,
        heading: 'Dashboard',
      },
      {
        open: () => tracker.openTransactions(),
        path: /\/movimientos$/,
        heading: 'Movimientos',
      },
      {
        open: () => tracker.openBudget(),
        path: /\/presupuesto$/,
        heading: 'Presupuesto',
      },
      {
        open: () => tracker.openWealth(),
        path: /\/patrimonio$/,
        heading: 'Patrimonio',
      },
      {
        open: () => tracker.openInvestment(),
        path: /\/inversion$/,
        heading: 'Inversión',
      },
      {
        open: () => tracker.openGoals(),
        path: /\/objetivos$/,
        heading: 'Objetivos',
      },
      {
        open: () => tracker.openSettings(),
        path: /\/configuracion$/,
        heading: 'Configuración',
      },
      {
        open: () => tracker.openData(),
        path: /\/datos$/,
        heading: 'Datos y backups',
      },
    ]

    for (const tab of tabs) {
      await tab.open()
      await expect(page).toHaveURL(tab.path)
      await expect(page.getByRole('heading', { name: tab.heading, exact: true })).toBeVisible()
    }
  })

  test('renderiza dashboard con KPIs', async ({ tracker }) => {
    await tracker.openDashboard()
    const incomeText = await tracker.dashboardIncomeText()
    expect(incomeText).toContain('€')
  })

  test('dashboard muestra la distribución del patrimonio con su leyenda', async ({ tracker }) => {
    await tracker.openDashboard()

    const block = tracker.dashboardSection.getByRole('region', {
      name: 'Distribución del patrimonio',
    })
    await expect(block).toBeVisible()
    await expect(
      block.getByRole('img', { name: 'Distribución del patrimonio por tipo de activo' }),
    ).toBeVisible()
    await expect(block.locator('#wealth-split-legend li').first()).toContainText('%')
  })
})
