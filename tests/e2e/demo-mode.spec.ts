import { test, expect } from './fixtures'
import { FinanceTrackerPage } from './pages/FinanceTrackerPage'

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
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem('finance-tracker-state-v1::demo')),
      )
      .not.toBeNull()
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

    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem('finance-tracker-state-v1::demo')),
      )
      .toContain('Cambio local de demo')

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

    const userMenuButton = page.getByRole('button', { name: 'Abrir menú de usuario' })
    await userMenuButton.click()

    const userMenu = page.getByRole('menu', { name: 'Menú de usuario' })
    await expect(userMenu).toBeVisible()

    await userMenu.getByRole('menuitem', { name: /Activar modo demo/ }).click()

    await expect(page.locator('html')).toHaveAttribute('data-demo', '1')
    await expect(page.getByText('Modo demo · datos ficticios')).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() => ({
          demoFlag: localStorage.getItem('finance-demo-mode'),
          demoState: localStorage.getItem('finance-tracker-state-v1::demo'),
        })),
      )
      .toMatchObject({
        demoFlag: '1',
        demoState: expect.stringContaining('Cuenta Corriente'),
      })

    await userMenuButton.click()
    await userMenu.getByRole('menuitem', { name: /Salir del modo demo/ }).click()

    await expect(page.locator('html')).not.toHaveAttribute('data-demo', '1')
    await expect(page.getByText('Modo demo · datos ficticios')).toBeHidden()
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('finance-demo-mode')))
      .toBeNull()
  })
})
