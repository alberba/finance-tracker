import { test, expect } from './fixtures'
import { LiveMarketPage } from './pages/LiveMarketPage'

test.describe('Dashboard section', () => {
  test('compone la cabecera, la franja tinta, el mes y los seis bloques', { tag: '@smoke' }, async ({
    page,
    tracker,
  }) => {
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
  })

  test('sincroniza el año, el mes y el rango con el controlador principal', async ({
    page,
    tracker,
  }) => {
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

    const range = dashboard.getByRole('group', { name: 'Rango temporal del gráfico' })
    await range.getByRole('button', { name: '7D' }).click()
    await expect(range.getByRole('button', { name: '7D' })).toHaveAttribute('aria-pressed', 'true')

    await tracker.openSettings()
    await expect(page.locator('#settings-year')).toHaveValue('2027')
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
    await items.first().getByRole('button', { name: /^Confirmar/ }).click()

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
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quotes }) })
    })

    await tracker.openSettings()
    const liveMarket = new LiveMarketPage(page)
    await liveMarket.addInstrument({ asset: 'ETF Plata', type: 'etf', symbol: 'VWCE', currency: 'EUR' })
    await liveMarket.addInstrument({ asset: 'ETF Plata', type: 'etf', symbol: 'LATE', currency: 'EUR' })
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
