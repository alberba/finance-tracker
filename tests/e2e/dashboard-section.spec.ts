import { test, expect } from './fixtures'
import { LiveMarketPage } from './pages/LiveMarketPage'

test.describe('Dashboard section', () => {
  test(
    'compone la cabecera, la franja tinta, el mes y los seis bloques',
    { tag: '@smoke' },
    async ({ page, tracker }) => {
      await tracker.openDashboard()
      const dashboard = tracker.dashboardSection

      await expect(dashboard.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
      await expect(dashboard.getByRole('button', { name: 'Nuevo movimiento' })).toBeVisible()

      const band = dashboard.getByRole('region', { name: 'Patrimonio neto' })
      await expect(band.locator('#kpi-net-worth')).toContainText('€')
      await expect(band.locator('#chart-networth')).toBeVisible()

      await expect(dashboard.locator('#kpi-income')).toContainText('€')
      await expect(dashboard.locator('#kpi-expense')).toContainText('€')
      await expect(dashboard.locator('#kpi-investment')).toContainText('€')
      await expect(dashboard.locator('#year-display')).toBeDisabled()
      await expect(dashboard.locator('#dashboard-month')).toBeVisible()

      for (const name of [
        'Distribución del patrimonio',
        'Top gastos del mes',
        'Pendientes',
        'Movimientos recientes',
        'Objetivos de ahorro',
        'Cotizaciones',
      ]) {
        await expect(dashboard.getByRole('heading', { name, exact: true })).toBeVisible()
      }
      await expect(page.locator('#chart-cashflow')).toHaveCount(0)
      await expect.poll(() => page.evaluate(() => '__dashboardViewModel' in window)).toBe(false)

      await dashboard.getByRole('button', { name: 'Ver presupuesto del mes' }).click()
      await expect(page).toHaveURL(/\/presupuesto$/)
    },
  )

  test('conserva el año, el mes y el rango entre secciones', async ({ page, tracker }) => {
    await tracker.addCustomTransaction({
      date: '2027-01-02',
      monthLabel: 'ENERO',
      type: 'income',
      categoryLabel: 'Nómina',
      amount: 1,
      description: 'Ingreso 2027',
    })

    await tracker.openDashboard()
    const dashboard = tracker.dashboardSection
    await expect(dashboard.locator('#year-display')).toBeEnabled()
    await dashboard.locator('#year-display').selectOption('2027')

    await dashboard.locator('#dashboard-month').selectOption('0')
    await expect(dashboard.locator('#dashboard-month')).toHaveValue('0')
    await expect(dashboard.getByRole('heading', { name: 'Enero', exact: true })).toBeVisible()
    await expect(dashboard.locator('#kpi-income')).toHaveText('1,00 €')

    const range = dashboard.getByRole('group', { name: 'Rango temporal del gráfico' })
    await range.getByRole('button', { name: '6M' }).click()
    await expect(range.getByRole('button', { name: '6M' })).toHaveAttribute('aria-pressed', 'true')

    await tracker.openSettings()
    await expect(page.locator('#settings-year')).toHaveValue('2027')
  })

  for (const { kind, january, february } of [
    { kind: 'income', january: '2.000,00 €', february: '2.085,00 €' },
    { kind: 'expense', january: '352,89 €', february: '404,77 €' },
    { kind: 'investment', january: '250,00 €', february: '200,00 €' },
  ]) {
    test(`consulta y restaura los importes de ${kind} con hover`, async ({ tracker }) => {
      await tracker.openDashboard()
      const dashboard = tracker.dashboardSection
      await dashboard.getByRole('combobox', { name: 'Mes', exact: true }).selectOption('3')
      const kpi = dashboard.locator(`[data-kpi="${kind}"]`)
      const figure = kpi.locator(`#kpi-${kind}`)
      const bars = kpi.getByRole('button')

      await bars.nth(0).hover()
      await expect(figure).toHaveText(january)
      await bars.nth(1).hover()
      await expect(figure).toHaveText(february)
      await bars.nth(3).hover()
      await expect(figure).toHaveText('0,00 €')
      await bars.nth(0).hover()
      await dashboard.getByRole('heading', { name: 'Dashboard', exact: true }).hover()
      await expect(figure).toHaveText('0,00 €')
    })

    test(`consulta y restaura los importes de ${kind} con Tab mientras el puntero sigue sobre otra barra`, async ({
      tracker,
    }) => {
      await tracker.openDashboard()
      const dashboard = tracker.dashboardSection
      const month = dashboard.getByRole('combobox', { name: 'Mes', exact: true })
      await month.selectOption('3')
      const kpi = dashboard.locator(`[data-kpi="${kind}"]`)
      const figure = kpi.locator(`#kpi-${kind}`)
      const bars = kpi.getByRole('button')

      await bars.nth(0).hover()
      await bars.nth(0).focus()
      await expect(figure).toHaveText(january)
      await bars.nth(0).press('Tab')
      await expect(bars.nth(1)).toBeFocused()
      await expect(figure).toHaveText(february)
      await dashboard.getByRole('heading', { name: 'Dashboard', exact: true }).hover()
      await expect(figure).toHaveText(february)
      await month.focus()
      await expect(figure).toHaveText('0,00 €')
    })
  }

  test('descarta la consulta al cambiar el mes con el puntero inmóvil sobre las barras', async ({
    tracker,
  }) => {
    await tracker.openDashboard()
    const dashboard = tracker.dashboardSection
    const month = dashboard.getByRole('combobox', { name: 'Mes', exact: true })
    await month.selectOption('3')
    const kpi = dashboard.locator('[data-kpi="investment"]')
    await kpi.getByRole('button').nth(0).hover()
    await expect(kpi.locator('#kpi-investment')).toHaveText('250,00 €')

    await month.selectOption('4')
    await expect(kpi.locator('#kpi-investment')).toHaveText('0,00 €')
  })

  test.describe('Consulta local del KPI', () => {
    test.beforeEach(async ({ tracker }) => {
      await tracker.openDashboard()
      const dashboard = tracker.dashboardSection
      await dashboard.getByRole('combobox', { name: 'Mes', exact: true }).selectOption('3')
      await dashboard.locator('[data-kpi="income"]').getByRole('button').nth(0).hover()
    })

    test('mantiene la comparación del mes seleccionado', async ({ tracker }) => {
      const income = tracker.dashboardSection.locator('[data-kpi="income"]')
      await expect(income.locator('[data-kpi-change]')).toHaveText('100,00 %')
      await expect(income).toContainText('Marzo: 2.000,00 €')
    })

    test('mantiene los importes de los otros KPI', async ({ tracker }) => {
      const dashboard = tracker.dashboardSection
      await expect(dashboard.locator('#kpi-expense')).toHaveText('0,00 €')
      await expect(dashboard.locator('#kpi-investment')).toHaveText('0,00 €')
    })

    test('mantiene el periodo seleccionado', async ({ tracker }) => {
      const dashboard = tracker.dashboardSection
      await expect(dashboard.getByRole('combobox', { name: 'Mes', exact: true })).toHaveValue('3')
      await expect(dashboard.getByRole('combobox', { name: 'Año', exact: true })).toHaveValue(
        '2026',
      )
    })
  })

  test('confirma y salta pendientes hasta dejarlo todo al día', async ({ page, tracker }) => {
    await tracker.openDashboard()
    const pending = page.locator('#dashboard [data-dashboard-pending]')
    await expect(pending.locator('[data-pending-empty]')).toHaveText(
      'Todo al día. Aún no hay pendientes.',
    )

    await tracker.openInvestmentRecurringTab()
    await new LiveMarketPage(page).createThreePendingMovements('2026-07-10')
    await tracker.openDashboard()
    const items = pending.locator('[data-pending-item]')
    await expect(items).toHaveCount(3)
    await expect(pending.getByRole('heading', { name: 'Pendientes 3' })).toBeVisible()

    await items.first().getByRole('button', { name: 'Confirmar Compra VWCE recurrente' }).click()
    await expect(items).toHaveCount(2)
    await items
      .first()
      .getByRole('button', { name: 'Saltar este vencimiento de Compra VWCE recurrente' })
      .click()
    await expect(items).toHaveCount(1)
    await items
      .first()
      .getByRole('button', { name: /^Confirmar/ })
      .click()

    await expect(items).toHaveCount(0)
    await expect(pending.locator('[data-pending-empty]')).toBeVisible()
  })

  test('abre el panel de nuevo movimiento desde la cabecera', async ({ page, tracker }) => {
    await tracker.openDashboard()
    await tracker.dashboardSection.getByRole('button', { name: 'Nuevo movimiento' }).click()

    await expect(page.getByRole('dialog', { name: 'Nuevo movimiento' })).toBeVisible()
  })

  test('muestra las cotizaciones y avisa solo de las retrasadas', async ({ page, tracker }) => {
    await page.route('**/api/market/quotes', async (route) => {
      const body = route.request().postDataJSON() as {
        instruments?: Array<{ id: string; symbol: string; currency: string }>
      }
      const now = new Date().toISOString()
      const quotes = Object.fromEntries(
        (body.instruments || []).map((instrument) => {
          const stale = instrument.symbol === 'LATE'
          return [
            instrument.id,
            {
              instrumentId: instrument.id,
              price: stale ? 90 : 125.5,
              currency: instrument.currency,
              timestamp: now,
              source: 'mock-provider',
              status: stale ? 'stale' : 'fresh',
              isStale: stale,
              previousClose: 100,
              changePercent: stale ? -10 : 1.21,
            },
          ]
        }),
      )
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ quotes }),
      })
    })

    await tracker.openSettings()
    const liveMarket = new LiveMarketPage(page)
    await liveMarket.addInstrument({
      asset: 'ETF Plata',
      type: 'etf',
      symbol: 'VWCE',
      currency: 'EUR',
    })
    await liveMarket.addInstrument({
      asset: 'ETF Plata',
      type: 'etf',
      symbol: 'LATE',
      currency: 'EUR',
    })
    await tracker.openDashboard()

    const quotes = page.locator('#dashboard [data-dashboard-quotes]')
    const fresh = quotes.locator('[data-quote="VWCE"]')
    const late = quotes.locator('[data-quote="LATE"]')
    await expect(fresh).toContainText('125,5')
    await expect(fresh).not.toContainText('Retrasado')
    await expect(late).toContainText('Retrasado')
    await expect(quotes.getByRole('button', { name: 'Actualizar' })).toBeEnabled()
  })
})

test('conserva el periodo y navega desde tarjetas con atrás y adelante en demo', async ({
  page,
  tracker,
}) => {
  await tracker.goto('/dashboard?demo=1')
  const dashboard = tracker.dashboardSection
  await dashboard.locator('#dashboard-month').selectOption('0')
  await expect(dashboard.getByRole('heading', { name: 'Enero', exact: true })).toBeVisible()
  await dashboard.getByRole('button', { name: 'Ver todos', exact: true }).click()
  await expect(page).toHaveURL(/\/movimientos$/)
  await expect(tracker.transactionsSection).toBeVisible()
  await page.goBack()
  await expect(dashboard).toBeVisible()
  await expect(dashboard.locator('#dashboard-month')).toHaveValue('0')
  await page.goForward()
  await expect(tracker.transactionsSection).toBeVisible()
  await expect(page.locator('[data-nav-item][data-section=transactions]:visible')).toHaveAttribute(
    'aria-current',
    'page',
  )
})
