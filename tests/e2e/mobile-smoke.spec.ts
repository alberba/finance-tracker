import { test, expect } from './fixtures'
import { editScenarioState } from './seed-sync-v2'

test.describe('Mobile smoke', () => {
  test(
    'mantiene legible el patrimonio y los movimientos en formato PWA',
    { tag: '@smoke' },
    async ({ page, tracker }) => {
      await page.goto('/patrimonio')
      const currentMonthIndex = new Date().getMonth()
      await editScenarioState(page, (state) => {
        const snapshot = state.snapshots[String(currentMonthIndex)]
        state.snapshots[String(currentMonthIndex)] = {
          ...snapshot,
          month: currentMonthIndex,
          accounts: { ...snapshot?.accounts, revolut: 9_999_999_999.99 },
        }
      })
      await tracker.goto()
      await expect(page.locator('html[data-finance-ready="true"]')).toBeVisible()
      await expect(
        tracker.dashboardSection.getByRole('heading', { name: 'Dashboard', exact: true }),
      ).toBeVisible()

      const hero = tracker.dashboardSection.getByRole('region', { name: 'Patrimonio neto' })
      const netWorth = hero.locator('#kpi-net-worth')
      await expect(netWorth).toContainText('€')

      const layout = await hero.evaluate((element) => {
        const amount = element.querySelector<HTMLElement>('#kpi-net-worth')
        if (!amount) return null

        const heroRect = element.getBoundingClientRect()
        const amountRect = amount.getBoundingClientRect()
        const lineHeight = Number.parseFloat(getComputedStyle(amount).lineHeight)
        return {
          amountFitsHero:
            amountRect.left >= heroRect.left - 1 && amountRect.right <= heroRect.right + 1,
          amountHasNoOverflow: amount.scrollWidth <= amount.clientWidth + 1,
          amountIsSingleLine: amountRect.height <= lineHeight * 1.1,
          viewportHasNoOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        }
      })

      expect(layout).toEqual({
        amountFitsHero: true,
        amountHasNoOverflow: true,
        amountIsSingleLine: true,
        viewportHasNoOverflow: true,
      })
      await expect(
        tracker.dashboardSection.getByRole('list', { name: 'Últimos movimientos' }),
      ).toBeVisible()
    },
  )

  test('prioriza el contenido y permite navegar con la barra inferior', async ({
    page,
    tracker,
  }) => {
    await expect(
      tracker.dashboardSection.getByRole('heading', { name: 'Dashboard', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Secciones del tracker' })).toBeHidden()
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()

    const titleBox = await tracker.dashboardSection
      .getByRole('heading', { name: 'Dashboard', exact: true })
      .boundingBox()
    const viewport = page.viewportSize()
    expect(titleBox).not.toBeNull()
    expect(viewport).not.toBeNull()
    expect(titleBox!.y).toBeLessThan(viewport!.height / 2)

    await tracker.openTransactions()
    await expect(page).toHaveURL(/\/movimientos$/)
    await expect(
      tracker.transactionsSection.getByRole('heading', {
        name: 'Movimientos',
        exact: true,
      }),
    ).toBeVisible()

    await tracker.openInvestment()
    await expect(page).toHaveURL(/\/inversion$/)
    await expect(
      tracker.section('investment').getByRole('heading', {
        name: 'Inversión',
        exact: true,
      }),
    ).toBeVisible()
  })

  test('permite alcanzar las acciones del nuevo movimiento con un viewport reducido', async ({
    page,
    tracker,
  }) => {
    await page.setViewportSize({ width: 393, height: 560 })
    await tracker.openTransactions()
    await page.locator('#tx-open-modal').click()

    // The panel fills the screen; its footer stays put while the fields scroll.
    const panel = page.getByRole('dialog', { name: 'Nuevo movimiento' })
    const addAnother = panel.getByRole('button', { name: 'Guardar y añadir otro' })
    await expect(addAnother).toBeVisible()

    const layout = await addAnother.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const body = element.closest('dialog')!.querySelector('form')!.parentElement!
      return {
        isWithinVisualViewport: rect.top >= 0 && rect.bottom <= window.innerHeight,
        bodyScrolls: body.scrollHeight > body.clientHeight,
      }
    })

    expect(layout).toEqual({ isWithinVisualViewport: true, bodyScrolls: true })
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
      tracker.section('wealth').getByRole('heading', { name: 'Patrimonio', exact: true }),
    ).toBeVisible()
    await expect(menu).toBeHidden()
    await expect(moreButton).toHaveAttribute('data-active', 'true')
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

  test('mantiene accesible el modo demo desde la experiencia PWA', async ({ page, tracker }) => {
    await tracker.goto()
    await expect(page.locator('html[data-finance-ready="true"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

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
    // Activating demo mode reloads the page, and the browser may restore a
    // scroll offset that tucks the banner under the sticky app bar: measure
    // the layout from the top, polled until the reload settles.
    const appBar = page.locator('[data-mobile-app-bar]')
    await expect
      .poll(async () => {
        await page.evaluate(() => window.scrollTo(0, 0))
        const [appBarBox, bannerBox] = await Promise.all([
          appBar.boundingBox(),
          banner.boundingBox(),
        ])
        if (!appBarBox || !bannerBox) return -1
        return bannerBox.y - (appBarBox.y + appBarBox.height)
      })
      .toBeGreaterThanOrEqual(0)

    await banner.getByRole('button', { name: 'Salir' }).click()
    await expect(page.locator('html')).not.toHaveAttribute('data-demo', '1')
  })

  test.describe('Presupuesto', () => {
    // 3 October 2026: October is the month in progress.
    test.use({ fixedTime: '2026-10-03T12:00:00' })

    test('deja el mes en curso y oculta los demás en lugar de desplazarse de lado', async ({
      tracker,
      page,
    }) => {
      await tracker.openBudget()
      const table = tracker.budgetSection.getByRole('table', { name: 'Gastos por categoría y mes' })
      await expect(table.getByRole('columnheader')).toHaveText(['Categoría', /Octubre\s*en curso/])

      await tracker.selectBudgetRange('12')
      await expect(table.getByRole('columnheader')).toHaveText([
        'Categoría',
        /Oct\s*en curso/,
        /Desvío/,
      ])
      await page.evaluate(() => document.fonts.ready)
      const fits = await table.evaluate((element) => {
        const scroller = element.parentElement!
        return scroller.scrollWidth <= scroller.clientWidth + 1
      })
      expect(fits).toBe(true)
      await expect(tracker.budgetSection.getByRole('textbox')).toHaveCount(0)

      const panel = await tracker.openBudgetPlan('Ocio')
      await expect(panel.getByRole('textbox', { name: 'Octubre' })).toBeVisible()
    })
  })
})
