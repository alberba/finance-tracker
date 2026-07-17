import { test, expect } from './fixtures'

test.describe('Mobile smoke', () => {
  test('prioriza el contenido y permite navegar con la barra inferior', async ({
    page,
    tracker,
  }) => {
    await expect(
      tracker.dashboardSection.getByRole('heading', {
        name: 'Resumen financiero',
      }),
    ).toBeVisible()
    await expect(page.locator('.sidebar')).toBeHidden()
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()

    const titleBox = await tracker.dashboardSection
      .getByRole('heading', { name: 'Resumen financiero' })
      .boundingBox()
    const viewport = page.viewportSize()
    expect(titleBox).not.toBeNull()
    expect(viewport).not.toBeNull()
    expect(titleBox!.y).toBeLessThan(viewport!.height / 2)

    await tracker.openTransactions()
    await expect(page).toHaveURL(/\/movimientos$/)
    await expect(
      tracker.transactionsSection.getByRole('heading', {
        name: 'Movimientos mensuales',
      }),
    ).toBeVisible()

    await tracker.openInvestment()
    await expect(page).toHaveURL(/\/inversion$/)
    await expect(
      tracker.section('investment').getByRole('heading', {
        name: 'Inversión y aportes',
      }),
    ).toBeVisible()
  })

  test('agrupa las secciones secundarias en un menú inferior accesible', async ({
    page,
    tracker,
  }) => {
    const moreButton = page.getByRole('button', { name: 'Más secciones' })
    await moreButton.click()

    const menu = page.getByRole('dialog', { name: 'Más secciones' })
    await expect(menu).toBeVisible()
    await expect(moreButton).toHaveAttribute('aria-expanded', 'true')
    await menu.getByRole('button', { name: 'Patrimonio' }).click()

    await expect(page).toHaveURL(/\/patrimonio$/)
    await expect(
      tracker.section('wealth').getByRole('heading', { name: 'Patrimonio total' }),
    ).toBeVisible()
    await expect(menu).toBeHidden()
    await expect(moreButton).toHaveClass(/is-active/)
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

  test('mantiene accesible el modo demo desde la experiencia PWA', async ({ page, request }) => {
    await request.post('/api/state/reset', {
      headers: { 'x-finance-namespace': 'demo' },
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Resumen financiero' })).toBeVisible()

    await page.getByRole('button', { name: 'Más secciones' }).click()
    await page
      .getByRole('dialog', { name: 'Más secciones' })
      .getByRole('button', {
        name: /Activar modo demo/,
      })
      .click()

    await expect(page.locator('html')).toHaveAttribute('data-demo', '1')
    const banner = page.getByRole('status').filter({ hasText: 'Modo demo · datos ficticios' })
    await expect(banner).toBeVisible()

    const appBarBox = await page.locator('.mobile-app-bar').boundingBox()
    const bannerBox = await banner.boundingBox()
    expect(appBarBox).not.toBeNull()
    expect(bannerBox).not.toBeNull()
    expect(bannerBox!.y).toBeGreaterThanOrEqual(appBarBox!.y + appBarBox!.height)

    await banner.getByRole('button', { name: 'Salir' }).click()
    await expect(page.locator('html')).not.toHaveAttribute('data-demo', '1')
  })
})
