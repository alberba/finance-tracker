import { test, expect } from './fixtures'

test.describe('Dashboard section', () => {
  test('renderiza la sección migrada y mantiene sus flujos principales', async ({
    page,
    tracker,
  }) => {
    await tracker.openDashboard()

    await expect(
      tracker.dashboardSection.getByRole('heading', { name: 'Resumen financiero' }),
    ).toBeVisible()
    await expect(tracker.dashboardSection.locator('#year-display')).toBeVisible()
    await expect(tracker.dashboardSection.locator('#dashboard-month')).toBeVisible()

    await expect(tracker.dashboardSection.locator('#kpi-income')).toContainText('€')
    await expect(tracker.dashboardSection.locator('#kpi-expense')).toContainText('€')
    await expect(tracker.dashboardSection.locator('#kpi-investment')).toContainText('€')
    await expect(tracker.dashboardSection.locator('#kpi-net-worth')).toContainText('€')

    await expect(
      tracker.dashboardSection.getByRole('heading', {
        name: 'Distribución de patrimonio',
      }),
    ).toBeVisible()
    await expect(
      tracker.dashboardSection.getByRole('heading', { name: 'Top gastos del mes' }),
    ).toBeVisible()
    await expect(
      tracker.dashboardSection.getByRole('heading', {
        name: 'Plan de inversión mensual',
      }),
    ).toBeVisible()
    await expect(
      tracker.dashboardSection.getByRole('heading', {
        name: 'Ingresos, gastos e inversión',
      }),
    ).toBeVisible()

    await expect(tracker.dashboardSection.locator('#chart-networth')).toBeVisible()
    await expect(tracker.dashboardSection.locator('#chart-cashflow')).toBeVisible()
    await expect(tracker.dashboardSection.locator('#recent-tx-body')).toBeVisible()
    await expect(tracker.dashboardSection.locator('#savings-goal')).toBeVisible()

    const chartDetails = await page.evaluate(() => {
      const cashflow = document.getElementById('chart-cashflow')
      const networth = document.getElementById('chart-networth')

      return {
        cashflowBarCount: Number(cashflow?.dataset.chartBarCount || 0),
        networthPointCount: Number(networth?.dataset.chartPointCount || 0),
      }
    })

    expect(chartDetails.cashflowBarCount).toBeGreaterThanOrEqual(0)
    expect(chartDetails.networthPointCount).toBeGreaterThanOrEqual(0)

    await tracker.dashboardSection.getByRole('button', { name: 'Ver todos los gastos' }).click()

    await expect(page).toHaveURL(/\/movimientos$/)
    await expect(
      tracker.transactionsSection.getByRole('heading', {
        name: 'Movimientos mensuales',
      }),
    ).toBeVisible()
  })

  test('sincroniza controles Vue del dashboard con el controlador principal', async ({
    page,
    tracker,
  }) => {
    await tracker.openDashboard()

    await tracker.dashboardSection.locator('#year-display').fill('2027')
    await tracker.dashboardSection.locator('#year-display').press('Tab')

    await tracker.dashboardSection.locator('#dashboard-month').selectOption('0')
    await expect(tracker.dashboardSection.locator('#dashboard-month')).toHaveValue('0')

    await tracker.dashboardSection.getByRole('button', { name: '7D' }).click()
    await expect(tracker.dashboardSection.getByRole('button', { name: '7D' })).toHaveClass(
      /is-active/,
    )

    await tracker.openSettings()
    await expect(page.locator('#settings-year')).toHaveValue('2027')
  })
})
