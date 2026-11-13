import type { Locator } from '@playwright/test'
import { test, expect } from './fixtures'
import { LiveMarketPage } from './pages/LiveMarketPage'
import { expectSyncCommand } from './pages/sync'

const FIXED_TIME = '2026-11-12T10:00:00Z'

/** The dashboard's period selectors, by their accessible names. */
const yearSelect = (dashboard: Locator) =>
  dashboard.getByRole('combobox', { name: 'Año', exact: true })
const monthSelect = (dashboard: Locator) =>
  dashboard.getByRole('combobox', { name: 'Mes', exact: true })

// The default year and month follow today; pin it so the figures below stay put.
test.use({ fixedTime: FIXED_TIME })

test.describe('Dashboard section', () => {
  test(
    'compone la cabecera, la franja tinta, el mes y los seis bloques',
    { tag: '@smoke' },
    async ({ page, tracker }) => {
      await tracker.openDashboard()
      const dashboard = tracker.dashboardSection

      await expect(dashboard.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
      await expect(dashboard.getByRole('button', { name: 'Nuevo movimiento' })).toBeVisible()

      await expect(tracker.netWorthKpi).toContainText('€')
      await expect(tracker.netWorthChart).toBeVisible()

      await expect(tracker.kpi('income').figure).toContainText('€')
      await expect(tracker.kpi('expense').figure).toContainText('€')
      await expect(tracker.kpi('investment').figure).toContainText('€')
      await expect(yearSelect(dashboard)).toBeDisabled()
      await expect(monthSelect(dashboard)).toBeVisible()

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
      await expect(tracker.cashflowChart).toHaveCount(0)
      await expect.poll(() => page.evaluate(() => '__dashboardViewModel' in window)).toBe(false)

      await dashboard.getByRole('button', { name: 'Ver presupuesto del mes' }).click()
      await expect(page).toHaveURL(/\/presupuesto$/)
    },
  )

  test('conserva el año, el mes y el rango entre secciones', async ({ tracker }) => {
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
    await expect(yearSelect(dashboard)).toBeEnabled()
    await yearSelect(dashboard).selectOption('2027')

    await monthSelect(dashboard).selectOption('1')
    await expect(monthSelect(dashboard)).toHaveValue('1')
    await expect(dashboard.getByRole('heading', { name: 'Enero', exact: true })).toBeVisible()
    await expect(tracker.kpi('income').figure).toHaveText('2.001,00 €')

    const range = dashboard.getByRole('group', { name: 'Rango temporal del gráfico' })
    await range.getByRole('button', { name: '6M' }).click()
    await expect(range.getByRole('button', { name: '6M' })).toHaveAttribute('aria-pressed', 'true')

    await tracker.openSettings()
    await expect(tracker.settingsYear).toHaveValue('2027')
  })

  for (const { kind, january, february } of [
    { kind: 'income', january: '2.000,00 €', february: '2.085,00 €' },
    { kind: 'expense', january: '352,89 €', february: '404,77 €' },
    { kind: 'investment', january: '250,00 €', february: '200,00 €' },
  ]) {
    test(`consulta y restaura los importes de ${kind} con Tab mientras el puntero sigue sobre otra barra`, async ({
      page,
      tracker,
    }) => {
      await tracker.openDashboard()
      const dashboard = tracker.dashboardSection
      const month = dashboard.getByRole('combobox', { name: 'Mes', exact: true })
      await month.selectOption('4')
      const { card, figure } = tracker.kpi(kind as 'income' | 'expense' | 'investment')
      const bars = card.getByRole('button')

      await page.mouse.move(0, 0)
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
    page,
    tracker,
  }) => {
    await tracker.openDashboard()
    const dashboard = tracker.dashboardSection
    const month = dashboard.getByRole('combobox', { name: 'Mes', exact: true })
    await month.selectOption('4')
    const { card, figure } = tracker.kpi('investment')
    await page.mouse.move(0, 0)
    await card.getByRole('button').nth(0).hover()
    await expect(figure).toHaveText('250,00 €')

    await month.selectOption('5')
    await expect(figure).toHaveText('0,00 €')
  })

  test.describe('Consulta local del KPI', () => {
    test.beforeEach(async ({ page, tracker }) => {
      await tracker.openDashboard()
      const dashboard = tracker.dashboardSection
      await dashboard.getByRole('combobox', { name: 'Mes', exact: true }).selectOption('4')
      await page.mouse.move(0, 0)
      await tracker.kpi('income').card.getByRole('button').nth(0).hover()
    })

    test('mantiene la comparación del mes seleccionado', async ({ tracker }) => {
      const income = tracker.kpi('income')
      await expect(income.change).toHaveText('100,00 %')
      await expect(income.card).toContainText('Marzo: 2.000,00 €')
    })

    test('mantiene los importes de los otros KPI', async ({ tracker }) => {
      await expect(tracker.kpi('expense').figure).toHaveText('0,00 €')
      await expect(tracker.kpi('investment').figure).toHaveText('0,00 €')
    })

    test('mantiene el periodo seleccionado', async ({ tracker }) => {
      const dashboard = tracker.dashboardSection
      await expect(dashboard.getByRole('combobox', { name: 'Mes', exact: true })).toHaveValue('4')
      await expect(dashboard.getByRole('combobox', { name: 'Año', exact: true })).toHaveValue(
        '2026',
      )
    })
  })

  test('confirma y salta pendientes hasta dejarlo todo al día', async ({ page, tracker }) => {
    await tracker.openDashboard()
    const liveMarket = new LiveMarketPage(page)
    const pending = liveMarket.dashboardPending
    await expect(liveMarket.dashboardPendingEmpty).toHaveText('Todo al día. Aún no hay pendientes.')

    await tracker.openInvestmentRecurringTab()
    await liveMarket.createThreePendingMovements('2026-07-10')
    await tracker.openDashboard()
    const items = liveMarket.dashboardPendingItems
    await expect(items).toHaveCount(3)
    await expect(pending.getByRole('heading', { name: 'Pendientes 3' })).toBeVisible()

    const firstConfirmed = expectSyncCommand(
      page,
      (command) =>
        command.action === 'update' &&
        command.entityType === 'pendingMovement' &&
        command.patch.status === 'confirmed',
    )
    await items.first().getByRole('button', { name: 'Confirmar Compra VWCE recurrente' }).click()
    await firstConfirmed
    await expect(items).toHaveCount(2)
    const skipped = expectSyncCommand(
      page,
      (command) =>
        command.action === 'update' &&
        command.entityType === 'pendingMovement' &&
        command.patch.status === 'skipped',
    )
    await items
      .first()
      .getByRole('button', { name: 'Saltar este vencimiento de Compra VWCE recurrente' })
      .click()
    await skipped
    await expect(items).toHaveCount(1)
    const lastConfirmed = expectSyncCommand(
      page,
      (command) =>
        command.action === 'update' &&
        command.entityType === 'pendingMovement' &&
        command.patch.status === 'confirmed',
    )
    await items
      .first()
      .getByRole('button', { name: /^Confirmar/ })
      .click()
    await lastConfirmed

    await expect(items).toHaveCount(0)
    await expect(liveMarket.dashboardPendingEmpty).toBeVisible()
  })

  test('abre el panel de nuevo movimiento desde la cabecera', async ({ page, tracker }) => {
    await tracker.openDashboard()
    await tracker.dashboardSection.getByRole('button', { name: 'Nuevo movimiento' }).click()

    await expect(page.getByRole('dialog', { name: 'Nuevo movimiento' })).toBeVisible()
  })

  test('el panel de nuevo movimiento se reabre al inicio desde la cabecera', async ({
    tracker,
  }) => {
    await tracker.openDashboard()
    const open = tracker.dashboardSection.getByRole('button', { name: 'Nuevo movimiento' })
    const panel = tracker.transactionPanel

    await open.click()
    await expect(panel).toBeVisible()
    await tracker.expectTransactionPanelAtTop()

    await tracker.scrollTransactionPanelToBottom()
    await panel.getByRole('button', { name: 'Cancelar' }).click()
    await expect(panel).toBeHidden()

    await open.click()
    await expect(panel).toBeVisible()
    await tracker.expectTransactionPanelAtTop()
  })

  test('muestra las cotizaciones y avisa solo de las retrasadas', async ({ page, tracker }) => {
    await page.route('**/api/market/quotes', async (route) => {
      const body = route.request().postDataJSON() as {
        instruments?: Array<{ id: string; symbol: string; currency: string }>
      }
      const now = FIXED_TIME
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

    const quotes = liveMarket.dashboardQuotes
    const fresh = liveMarket.dashboardQuote('VWCE')
    const late = liveMarket.dashboardQuote('LATE')
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
  await page.goto('/dashboard?demo=1')
  await tracker.expectReady()
  const dashboard = tracker.dashboardSection
  await monthSelect(dashboard).selectOption('1')
  await expect(dashboard.getByRole('heading', { name: 'Enero', exact: true })).toBeVisible()
  await dashboard.getByRole('button', { name: 'Ver todos', exact: true }).click()
  await expect(page).toHaveURL(/\/movimientos$/)
  await expect(tracker.transactionsSection).toBeVisible()
  await page.goBack()
  await expect(dashboard).toBeVisible()
  await expect(monthSelect(dashboard)).toHaveValue('1')
  await page.goForward()
  await expect(tracker.transactionsSection).toBeVisible()
  await expect(tracker.navItem('transactions')).toHaveAttribute('aria-current', 'page')
})
