import { editScenarioState } from './seed-sync-v2'
import { test, expect } from './fixtures'

test.describe('inversión tabs y TWR', () => {
  test('una venta manual resta la comisión y conserva el neto al recargar', async ({ tracker }) => {
    await tracker.addInvestmentMovement({
      date: '2026-09-04',
      time: '12:00',
      side: 'sell',
      symbol: 'E2ESELL',
      units: 2,
      unitPrice: 50,
      fee: 2,
    })
    const row = tracker.investmentMovementRow('E2ESELL')
    await expect(row).toContainText('98,00')
    await tracker.reload()
    await tracker.openInvestmentMovementsTab()
    await expect(row).toContainText('98,00')
  })
  test('inversión muestra 3 subpestañas y alterna vistas', async ({ tracker }) => {
    await tracker.openInvestment()
    const investmentSection = tracker.investmentSection()

    await expect(investmentSection.getByRole('tab', { name: 'Resumen' })).toBeVisible()
    await expect(investmentSection.getByRole('tab', { name: 'Movimientos' })).toBeVisible()
    await expect(investmentSection.getByRole('tab', { name: 'Aportes' })).toBeVisible()

    await tracker.openInvestmentDashboardTab()
    await expect(tracker.investmentTabPanel('dashboard')).toBeVisible()
    await expect(tracker.investmentTabPanel('movements')).toBeHidden()

    await tracker.openInvestmentMovementsTab()
    await expect(tracker.investmentTabPanel('movements')).toBeVisible()

    await tracker.openInvestmentContributionsTab()
    await expect(tracker.investmentTabPanel('contributions')).toBeVisible()
  })

  test('movimientos de inversión solo muestra tipo inversión', async ({ tracker }) => {
    await tracker.openInvestmentMovementsTab()
    const operations = await tracker.getInvestmentMovementsOperations()
    expect(operations.length).toBeGreaterThan(0)
    expect(operations.every((value) => value === 'Compra' || value === 'Venta')).toBe(true)
  })

  test('permite descontar una compra del efectivo de Stock Events', async ({ tracker, page }) => {
    await tracker.openInvestmentMovementsTab()
    await expect(
      tracker.investmentSection().getByRole('switch', { name: /efectivo en Stock Events/ }),
    ).toHaveCount(0)

    let syncedTransaction: Record<string, unknown> | undefined
    // The integration's answer is held until the test has seen the movement's own
    // «guardado» notice: a fast answer would replace that notice with its own.
    let releaseStockEvents!: () => void
    const stockEventsHeld = new Promise<void>((resolve) => {
      releaseStockEvents = resolve
    })
    await page.route('**/api/integrations/stockevents', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"configured":true}' }),
    )
    await page.route('**/api/stockevents/transactions', async (route) => {
      const body = route.request().postDataJSON() as {
        transaction?: Record<string, unknown>
      }
      syncedTransaction = body.transaction
      await stockEventsHeld
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          transaction: {
            id: 'se-cash-1',
            watchlistId: 'wl-etf',
            symbol: 'CASHBUY',
          },
        }),
      })
    })

    await editScenarioState(page, (state) => {
      state.stockEvents = {
        enabled: true,
        apiKey: '',
        symbolMappings: [
          {
            symbol: 'CASHBUY',
            sync: true,
            watchlistId: 'wl-etf',
            targetSymbol: '',
            hidden: false,
          },
        ],
      }
    })
    await tracker.reload()
    await tracker
      .investmentMovementFields(await tracker.openInvestmentMovementPanel())
      .symbol.fill('CASHBUY')

    await expect(
      tracker.investmentSection().getByRole('switch', {
        name: 'Descontar del efectivo en Stock Events',
      }),
    ).toBeVisible()

    await tracker.addInvestmentMovement({
      date: '2026-07-19',
      time: '10:04',
      side: 'buy',
      symbol: 'CASHBUY',
      category: 'Fondos Indexados',
      unitPrice: 50,
      units: 2,
      fee: 1,
      brokerName: 'Revolut',
      stockEventsCash: true,
    })
    releaseStockEvents()

    await expect
      .poll(() => syncedTransaction)
      .toMatchObject({
        watchlistId: 'wl-etf',
        symbol: 'CASHBUY',
        change: 2,
        price: 50,
        feesAmount: 1,
        toCash: true,
        type: 'buy',
      })
  })

  test('no ofrece ajustar efectivo para símbolos sin mapeo activo', async ({ tracker, page }) => {
    await editScenarioState(page, (state) => {
      state.stockEvents = {
        enabled: true,
        apiKey: 'test-stock-events-key',
        symbolMappings: [],
      }
    })
    await tracker.reload()
    await tracker
      .investmentMovementFields(await tracker.openInvestmentMovementPanel())
      .symbol.fill('UNMAPPED')

    await expect(
      tracker.investmentSection().getByRole('switch', { name: /efectivo en Stock Events/ }),
    ).toHaveCount(0)
  })

  test('avisa y permite reenviar un movimiento salteado por Stock Events', async ({
    tracker,
    page,
  }) => {
    await page.route('**/api/integrations/stockevents', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"configured":true}' }),
    )
    let syncedTransaction: Record<string, unknown> | undefined
    await page.route('**/api/stockevents/transactions', async (route) => {
      const body = route.request().postDataJSON() as {
        transaction?: Record<string, unknown>
      }
      syncedTransaction = body.transaction
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          transaction: {
            id: 'se-resend-1',
            watchlistId: 'wl-etf',
            symbol: 'RESEND',
          },
        }),
      })
    })

    // Warmup: compile the lazy investment chunk before the reload flow.
    await tracker.openInvestmentMovementsTab()

    await editScenarioState(page, (state) => {
      state.stockEvents = { enabled: true, apiKey: '', symbolMappings: [] }
    })
    await tracker.reload()
    await tracker.openInvestmentMovementsTab()

    // Sin mapeo el envío automático se salta con aviso visible y sin botón.
    const section = await tracker.openInvestmentMovementPanel()
    const fields = tracker.investmentMovementFields(section)
    await fields.date.fill('2026-09-04')
    await fields.time.fill('16:11')
    await fields.side('buy').click()
    await fields.symbol.fill('RESEND')
    await fields.unitPrice.fill('2110.3')
    await fields.units.fill('0.0047')
    await fields.fee.fill('0.03')
    await fields.broker.selectOption({ label: 'Revolut' })
    await section.getByRole('button', { name: 'Guardar movimiento' }).click()
    await expect(page.getByRole('status')).toContainText('no tiene sincronización activada')
    await expect(
      tracker.investmentSection().getByRole('button', { name: /^Reenviar / }),
    ).toHaveCount(0)

    // El mapeo llega después: aparece el botón y el reenvío crea la transacción.
    await editScenarioState(page, (state) => {
      expect(state.transactions.find((movement) => movement.date === '2026-09-04')).toMatchObject({
        symbol: 'RESEND',
        units: 0.0047,
        side: 'buy',
      })
      state.stockEvents.symbolMappings = [
        { symbol: 'RESEND', sync: true, watchlistId: 'wl-etf', targetSymbol: '', hidden: false },
      ]
    })
    await tracker.reload()
    await tracker.openInvestmentMovementsTab()
    const resend = tracker
      .investmentSection()
      .getByRole('button', { name: /^Reenviar compra de RESEND .* a Stock Events$/ })
    await expect(resend).toBeVisible()
    await resend.click()
    await expect
      .poll(() => syncedTransaction)
      .toMatchObject({
        watchlistId: 'wl-etf',
        symbol: 'RESEND',
        type: 'buy',
      })
    expect(Number(syncedTransaction?.change)).toBeCloseTo(0.0047, 8)
    expect(Number(syncedTransaction?.price)).toBeCloseTo(2110.3, 6)
  })

  test('editar y eliminar en movimientos de inversión se refleja en movimientos generales', async ({
    tracker,
  }) => {
    await tracker.addInvestmentMovement({
      date: '2026-02-22',
      time: '10:30',
      side: 'buy',
      symbol: 'E2ESYNC',
      unitPrice: 25,
      units: 3,
      fee: 2,
      movementCurrency: 'EUR',
      brokerName: 'Revolut',
    })

    await tracker.editInvestmentMovementBySymbol('E2ESYNC', {
      unitPrice: 30,
      units: 2,
      fee: 1,
      newSymbol: 'E2EEDIT',
      category: 'Fondos Indexados',
      declared: true,
    })

    await tracker.expectInvestmentMovementCategory('E2EEDIT', 'Fondos Indexados')

    await tracker.openTransactions()
    await tracker.filterTransactionsMonth('FEBRERO')
    await tracker.setTransactionDescriptionFilter('Compra 2 E2EEDIT')
    await tracker.expectTransactionDescriptionVisible('Compra 2 E2EEDIT')

    await tracker.deleteInvestmentMovementBySymbol('E2EEDIT')
    await tracker.openTransactions()
    await tracker.filterTransactionsMonth('FEBRERO')
    await tracker.setTransactionDescriptionFilter('Compra 2 E2EEDIT')
    await expect(tracker.transactionRows.filter({ hasText: 'Compra 2 E2EEDIT' })).toHaveCount(0)
  })

  test('filtros de año y no declarados en inversión', async ({ tracker }) => {
    await tracker.addInvestmentMovement({
      date: '2025-12-10',
      time: '12:00',
      side: 'buy',
      symbol: 'YEAR2025',
      unitPrice: 10,
      units: 5,
      fee: 0,
      declared: false,
    })
    await tracker.addInvestmentMovement({
      date: '2026-01-10',
      time: '12:00',
      side: 'buy',
      symbol: 'YEAR2026D',
      unitPrice: 10,
      units: 5,
      fee: 0,
      declared: true,
    })

    await tracker.openInvestmentMovementsTab()
    await tracker.filterInvestmentYear(2025)
    await expect(tracker.investmentMovementRows.filter({ hasText: 'YEAR2025' })).toHaveCount(1)
    await expect(tracker.investmentMovementRows.filter({ hasText: 'YEAR2026D' })).toHaveCount(0)

    await tracker.filterInvestmentYear(2026)
    await tracker.setInvestmentOnlyUndeclared(true)
    await expect(tracker.investmentMovementRows.filter({ hasText: 'YEAR2026D' })).toHaveCount(0)
  })

  test('categoría de inversión: Bitvavo fija Crypto y otros brokers permiten elegir del desplegable', async ({
    tracker,
  }) => {
    const fields = tracker.investmentMovementFields(await tracker.openInvestmentMovementPanel())
    await fields.broker.selectOption({ label: 'Bitvavo' })
    await expect(fields.category).toBeDisabled()
    await expect(fields.category).toHaveValue('Crypto')

    await fields.broker.selectOption({ label: 'Revolut' })
    await expect(fields.category).toBeEnabled()

    await tracker.addInvestmentMovement({
      date: '2026-03-10',
      time: '09:30',
      side: 'buy',
      symbol: 'BTC',
      category: 'NoDeberiaQuedar',
      unitPrice: 10,
      units: 1,
      fee: 0,
      brokerName: 'Bitvavo',
    })

    await tracker.addInvestmentMovement({
      date: '2026-03-11',
      time: '10:00',
      side: 'buy',
      symbol: 'VWCE',
      category: 'Fondos Indexados',
      unitPrice: 10,
      units: 1,
      fee: 0,
      brokerName: 'Revolut',
    })

    await tracker.openTransactions()
    await tracker.filterTransactionsMonth('MARZO')
    await expect(tracker.transactionRows.filter({ hasText: 'Compra 1 BTC' })).toContainText(
      'Crypto',
    )
    await expect(tracker.transactionRows.filter({ hasText: 'Compra 1 VWCE' })).toContainText(
      'Fondos Indexados',
    )
  })

  test('el símbolo en movimientos de inversión conserva espacios mientras se escribe', async ({
    tracker,
  }) => {
    const symbolInput = tracker.investmentMovementFields(
      await tracker.openInvestmentMovementPanel(),
    ).symbol
    await symbolInput.click()
    await symbolInput.pressSequentially('MSCI WORLD')
    await expect(symbolInput).toHaveValue('MSCI WORLD')

    await tracker.addInvestmentMovement({
      date: '2026-03-12',
      time: '11:15',
      side: 'buy',
      symbol: 'MSCI WORLD',
      unitPrice: 10,
      units: 1,
      fee: 0,
      brokerName: 'Revolut',
    })

    await expect(tracker.investmentMovementRows.filter({ hasText: 'MSCI WORLD' })).toHaveCount(1)
  })

  test('aportes muestra el registro de cierres con base 100 y retornos iniciales vacíos', async ({
    tracker,
  }) => {
    await tracker.openInvestmentContributionsTab()

    expect(await tracker.contributionHeaders()).toEqual([
      'Cierre',
      'Valor cartera',
      'Aporte',
      'VL',
      'Participaciones',
      'Periodo',
      'Acumulado',
      'Origen',
    ])

    // Newest first: the base close is the last row.
    const baseRow = tracker.contributionRows.last()
    await expect(tracker.contributionCell(baseRow, 'nav')).toHaveText('100,0000')
    await expect(tracker.contributionCell(baseRow, 'period')).toHaveText('—')
    await expect(tracker.contributionCell(baseRow, 'cumulative')).toHaveText('—')
  })

  test('editar el aporte de un cierre recalcula y persiste tras recarga', async ({ tracker }) => {
    await tracker.openInvestmentContributionsTab()

    // Month-end closes carry no flow of their own; only the manual
    // contribution has a real flow to edit, so the recalculation shows.
    await expect(tracker.contributionRow('2026-01-28')).toBeVisible()
    const downstreamNav = tracker.contributionCell(tracker.contributionRow('2026-02-28'), 'nav')
    const previousNav = (await downstreamNav.innerText()).trim()

    await tracker.setContributionFlowByDate('2026-01-28', 0)

    await expect(downstreamNav).not.toHaveText(previousNav)
    const nextNav = (await downstreamNav.innerText()).trim()

    await tracker.reload()
    await tracker.openInvestmentContributionsTab()
    await expect(tracker.contributionCell(tracker.contributionRow('2026-02-28'), 'nav')).toHaveText(
      nextNav,
    )
  })

  test('aportes muestra también fechas manuales fuera de cierre mensual', async ({ tracker }) => {
    await tracker.openInvestmentContributionsTab()

    const manualRow = tracker.contributionRow('2026-01-28')
    await expect(manualRow).toBeVisible()
    await expect(tracker.contributionFlowInput('2026-01-28')).toHaveValue('200')
    await expect(tracker.contributionCell(manualRow, 'origin')).toContainText('Manual')
  })

  test('aportes automáticos de cierre mensual incluyen la liquidez del mes en valor cartera', async ({
    tracker,
  }) => {
    await tracker.openInvestmentContributionsTab()

    const monthEndRow = tracker.contributionRow('2026-01-31')
    await expect(monthEndRow).toBeVisible()
    await expect(tracker.contributionCell(monthEndRow, 'value')).toHaveText('11.209,45 €')
    await expect(tracker.contributionCell(monthEndRow, 'origin')).toHaveText('Cierre de mes')
    await expect(tracker.contributionDeleteButton('2026-01-31')).toHaveCount(0)
  })

  test('aportes manuales se pueden eliminar desde la tabla', async ({ tracker, page }) => {
    await tracker.deleteManualContributionByDate('2026-01-28')
    await expect(tracker.contributionDeleteDialog).toContainText('28 ene 2026')
    await tracker.confirmDeleteManualContribution()
    await expect(page.getByRole('status')).toContainText('Aporte manual eliminado.')
    await expect(tracker.contributionRow('2026-01-28')).toHaveCount(0)
  })

  test('aportes resume el año y dibuja el valor liquidativo', async ({ tracker }) => {
    await tracker.openInvestmentContributionsTab()

    const summary = tracker.contributionSummary
    await expect(summary).toContainText('Rentabilidad TWR')
    await expect(summary).toContainText('Aportado en 2026')
    await expect(tracker.contributionNavChart).toBeVisible()
  })

  test('el registro de aportes oculta columnas secundarias en móvil', async ({ tracker, page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await tracker.openInvestmentContributionsTab()

    const row = tracker.contributionRow('2026-01-31')
    await expect(tracker.contributionCell(row, 'nav')).toBeHidden()
    await expect(tracker.contributionCell(row, 'flow')).toBeVisible()
  })
})
