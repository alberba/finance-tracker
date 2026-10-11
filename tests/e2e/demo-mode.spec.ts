import { syncV2Test as test, expect } from './fixtures'
import { FinanceTrackerPage } from './pages/FinanceTrackerPage'
import { readScenarioState } from './seed-sync-v2'

test.describe('Modo demo', () => {
  test('entra por la ruta pública y mantiene los cambios fuera de las APIs persistentes', async ({
    page,
  }) => {
    const remoteRequests: string[] = []
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname
      if (
        pathname === '/api/state' ||
        pathname === '/api/session' ||
        pathname === '/api/sync' ||
        pathname === '/api/state/initialize' ||
        pathname === '/api/data/import' ||
        pathname === '/api/market/quotes' ||
        pathname === '/api/issues/report'
      ) {
        remoteRequests.push(`${request.method()} ${pathname}`)
      }
    })

    await page.goto('/demo')

    await expect(page.locator('html')).toHaveAttribute('data-demo', '1')
    await expect(page.getByText('Modo demo · datos ficticios')).toBeVisible()
    await page.goto('/movimientos')

    const tracker = new FinanceTrackerPage(page)
    await tracker.addCustomTransaction({
      date: '2026-08-12',
      monthLabel: 'AGOSTO',
      type: 'expense',
      categoryLabel: 'Comida',
      amount: 7.5,
      description: 'Cambio local de demo',
    })

    await tracker.filterTransactionsMonth('AGOSTO')
    await expect(tracker.transactionRow('Cambio local de demo')).toBeVisible()

    await tracker.submitIssueReport({
      type: 'bug',
      summary: 'Reporte desde demo',
      description: 'Este reporte debe permanecer únicamente en el navegador.',
    })
    await expect(tracker.issueReportStatus()).toContainText(
      'Los reportes no se envían desde el modo demo.',
    )

    expect(remoteRequests).toEqual([])
  })

  test('se activa y desactiva desde el menú de usuario sin mezclar la caché real', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('html[data-finance-ready="true"]')).toBeVisible()
    const authenticatedState = await readScenarioState(page)
    authenticatedState.meta.generatedAt = ''

    const userMenuButton = page.getByRole('button', { name: 'Abrir menú de usuario' })
    await userMenuButton.click()

    const userMenu = page.getByRole('menu', { name: 'Menú de usuario' })
    await expect(userMenu).toBeVisible()

    await userMenu.getByRole('menuitem', { name: /Activar modo demo/ }).click()

    await expect(page.locator('html')).toHaveAttribute('data-demo', '1')
    await expect(page.getByText('Modo demo · datos ficticios')).toBeVisible()
    const tracker = new FinanceTrackerPage(page)
    await tracker.addCustomTransaction({
      date: '2026-08-12',
      monthLabel: 'AGOSTO',
      type: 'expense',
      categoryLabel: 'Comida',
      amount: 7.5,
      description: 'Edición aislada de demo',
    })

    await userMenuButton.click()
    await userMenu.getByRole('menuitem', { name: /Salir del modo demo/ }).click()

    await expect(page.locator('html')).not.toHaveAttribute('data-demo', '1')
    await expect(page.getByText('Modo demo · datos ficticios')).toBeHidden()
    const currentState = await readScenarioState(page)
    currentState.meta.generatedAt = ''
    expect(currentState).toEqual(authenticatedState)
  })
})
