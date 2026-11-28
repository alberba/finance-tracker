import { test, expect } from './fixtures'

/** The installed app (PWA) on a phone: what the mobile frame specs don't cover. */
test.describe('Mobile smoke', () => {
  test('la entrada Movimientos de la barra inferior vuelve al inicio de la sección', async ({
    page,
    tracker,
  }) => {
    await tracker.openTransactions()
    await tracker.scrollToPageBottom()
    await expect.poll(() => tracker.scrollY()).toBeGreaterThan(0)

    await tracker.clickNav('transactions')

    await expect(page).toHaveURL(/\/movimientos$/)
    await expect.poll(() => tracker.scrollY()).toBe(0)
    await expect(
      page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('button', {
        name: 'Movimientos',
      }),
    ).toHaveAttribute('aria-current', 'page')
    await expect(tracker.entrySheet).toBeHidden()
  })

  test('ofrece el reporte al final del menú Más sin ocupar la barra inferior', async ({
    page,
    tracker,
  }) => {
    await expect(tracker.dashboardSection).toBeVisible()
    await page.getByRole('button', { name: 'Más secciones' }).click()

    const menu = page.getByRole('dialog', { name: 'Más secciones' })
    await menu.getByRole('button', { name: 'Crear reporte' }).click()

    await expect(menu).toBeHidden()
    await expect(tracker.issueReportDialog).toBeVisible()
    await expect(tracker.issueReportDialog.getByLabel('Resumen')).toBeFocused()
    await expect(page.locator('#global-report-trigger')).toBeHidden()
  })

  test('publica los metadatos mínimos de instalación PWA', async ({ page, tracker }) => {
    await expect(tracker.dashboardSection).toBeVisible()
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest',
    )

    const manifestResponse = await page.request.get('/manifest.webmanifest')
    expect(manifestResponse.ok()).toBe(true)
    const manifest = await manifestResponse.json()
    expect(manifest).toMatchObject({
      name: 'Finance Tracker',
      start_url: '/',
      display: 'standalone',
    })
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: '192x192' }),
        expect.objectContaining({ sizes: '512x512' }),
      ]),
    )
  })
})
