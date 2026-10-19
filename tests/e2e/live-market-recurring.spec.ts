import { editScenarioState } from './seed-sync-v2'
import { test, expect } from './fixtures'
import { LiveMarketPage } from './pages/LiveMarketPage'

test.describe('precios de mercado y movimientos recurrentes', () => {
  test('mantiene gestionables las reglas históricas de ingresos y gastos', async ({
    page,
    tracker,
  }) => {
    await editScenarioState(page, (state) => {
      state.recurringRules.push({
        id: 'legacy-expense-rule',
        type: 'expense',
        accountId: state.accounts[0].id,
        category: state.expenseCategories[0],
        description: 'Alquiler histórico',
        amount: 900,
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-01-01',
        endDate: null,
        active: true,
        lastExecutionDate: null,
        nextOccurrenceDate: '2026-09-01',
      })
    })
    await tracker.reload()
    await tracker.openSettingsTab('Recurrentes')

    const tab = page.locator('#settings [data-settings-recurring]')
    const rule = tab.locator('tr[data-settings-rule-id="legacy-expense-rule"]')
    await expect(rule).toBeVisible()
    const toggle = rule.getByRole('switch', { name: 'Regla Alquiler histórico activa' })
    await toggle.uncheck({ force: true })
    await expect(toggle).not.toBeChecked()
    await rule.getByRole('button', { name: 'Editar la regla Alquiler histórico' }).click()
    const panel = page.locator('#settings-recurring-panel')
    await expect(panel.getByLabel('Descripción')).toHaveValue('Alquiler histórico')
    await panel.getByRole('button', { name: 'Cancelar' }).click()
    await expect(panel).toBeHidden()

    await tracker.openInvestmentRecurringTab()
    await expect(page.locator('#investment [data-recurring-rules]')).not.toContainText(
      'Alquiler histórico',
    )
  })

  test(
    'configura un instrumento y muestra una cotización mockeada con actualización',
    { tag: '@smoke' },
    async ({ page, tracker }) => {
      await page.route('**/api/market/quotes', async (route) => {
        const body = route.request().postDataJSON() as {
          instruments?: Array<{ id: string; currency: string }>
        }
        const now = new Date().toISOString()
        const quotes = Object.fromEntries(
          (body.instruments || []).map((instrument) => [
            instrument.id,
            {
              instrumentId: instrument.id,
              price: 125.5,
              currency: instrument.currency,
              timestamp: now,
              source: 'mock-provider',
              status: 'fresh',
              isStale: false,
              previousClose: 124,
              changePercent: 1.21,
            },
          ]),
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
      await tracker.openInvestmentDashboardTab()

      const panel = page.locator('#investment [data-investment-quotes]')
      await expect(panel.getByText('VWCE', { exact: true })).toBeVisible()
      await expect(panel.getByText('Actualizado')).toBeVisible()
      await expect(panel.getByText('125,50 €')).toBeVisible()
      const holdingsInput = panel.getByLabel('Títulos de VWCE')
      await expect(holdingsInput).toHaveValue('0')
      await holdingsInput.fill('0.25')
      await holdingsInput.press('Tab')
      await expect(holdingsInput).toHaveValue('0.25')
    },
  )

  test('usa Yahoo por defecto y actualiza la cotización europea sin recargar', async ({
    page,
    tracker,
  }) => {
    let requestedProvider = ''
    let price = 9.276
    await page.route('**/api/market/quotes', async (route) => {
      const body = route.request().postDataJSON() as {
        instruments?: Array<{ id: string; provider: string; currency: string }>
      }
      requestedProvider = body.instruments?.[0]?.provider || ''
      const instrument = body.instruments?.[0]
      const quotes = instrument
        ? {
            [instrument.id]: {
              instrumentId: instrument.id,
              price,
              currency: instrument.currency,
              timestamp: new Date().toISOString(),
              source: 'yahoo',
              status: 'fresh',
              isStale: false,
              previousClose: 9.312,
              changePercent: -0.39,
            },
          }
        : {}
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ quotes }),
      })
    })

    await page.clock.install()
    await tracker.reload()
    await tracker.openSettings()
    const liveMarket = new LiveMarketPage(page)
    await liveMarket.addInstrument({
      asset: 'ETF AGED',
      type: 'etf',
      symbol: 'AGED.MI',
      currency: 'EUR',
    })
    await tracker.openInvestmentDashboardTab()

    const panel = page.locator('#investment [data-investment-quotes]')
    await expect(panel.getByText('AGED.MI', { exact: true })).toBeVisible()
    await expect(panel.getByText('9,28 €')).toBeVisible()
    expect(requestedProvider).toBe('yahoo')

    price = 9.5
    const nextQuote = page.waitForResponse('**/api/market/quotes')
    await page.clock.fastForward(5 * 60_000)
    await nextQuote
    await expect(panel.getByText('9,50 €')).toBeVisible()
  })

  test('cotiza BTC-EUR y conserva los títulos de los movimientos BTC', async ({
    page,
    tracker,
  }) => {
    let requestedSymbol = ''
    await page.route('**/api/market/quotes', async (route) => {
      const instrument = route.request().postDataJSON().instruments[0]
      requestedSymbol = instrument.quoteSymbol || instrument.symbol
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          quotes: {
            [instrument.id]: {
              instrumentId: instrument.id,
              price: 73_000,
              currency: 'EUR',
              timestamp: new Date().toISOString(),
              source: 'yahoo',
              status: 'fresh',
              isStale: false,
              previousClose: 72_000,
              changePercent: 1.39,
            },
          },
        }),
      })
    })
    await tracker.addInvestmentMovement({
      date: '2026-07-10',
      time: '09:30',
      side: 'buy',
      symbol: 'BTC',
      category: 'Crypto',
      units: 0.09491284,
      unitPrice: 100,
      fee: 0,
    })
    await tracker.openSettings()
    await new LiveMarketPage(page).addInstrument({
      asset: 'Crypto',
      type: 'crypto',
      symbol: 'BTC',
      quoteSymbol: 'BTC-EUR',
      currency: 'EUR',
    })
    await tracker.openInvestmentDashboardTab()
    const quotes = page.locator('#investment [data-investment-quotes]')
    await expect(quotes.getByLabel('Títulos de BTC', { exact: true })).toHaveValue('0.09491284')
    await expect(quotes.getByText('73.000,00 €', { exact: true })).toBeVisible()
    expect(requestedSymbol).toBe('BTC-EUR')
    await tracker.waitForSync()
    await tracker.reload()
    await tracker.openInvestmentDashboardTab()
    await expect(quotes.getByLabel('Títulos de BTC', { exact: true })).toHaveValue('0.09491284')
    await expect(quotes.getByText('73.000,00 €', { exact: true })).toBeVisible()
  })

  test('busca y guarda el símbolo fuente aproximado de un ETF', async ({ page, tracker }) => {
    await page.route('**/api/market/search**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            {
              symbol: 'XDWH.DE',
              name: 'Xtrackers MSCI World Health Care UCITS ETF 1C',
              exchange: 'XETRA',
              currency: 'EUR',
              type: 'ETF',
            },
          ],
        }),
      })
    })

    await tracker.openSettings()
    const liveMarket = new LiveMarketPage(page)
    await liveMarket.addInstrument({
      asset: 'ETF XDWH',
      type: 'etf',
      symbol: 'XDWH.XETRA',
      currency: 'EUR',
      provider: 'yahoo',
      keepOpen: true,
    })
    await liveMarket.searchSourceSymbol('XDWH.XETRA', 'XDWH.XETRA')
    const candidate = liveMarket
      .instrument('XDWH.XETRA')
      .getByRole('link', { name: 'Ver XDWH.DE en Yahoo Finance (nueva pestaña)' })
    await expect(candidate).toHaveAttribute('href', 'https://finance.yahoo.com/quote/XDWH.DE/')
    await expect(candidate).toHaveAttribute('target', '_blank')
    await liveMarket.selectSourceSearchResult('XDWH.XETRA', 'XDWH.DE')
    await liveMarket.saveSourceSymbol('XDWH.XETRA')

    await expect(liveMarket.instrument('XDWH.XETRA')).toBeVisible()
    await expect(
      liveMarket.instrument('XDWH.XETRA').getByLabel('Ticker de XDWH.XETRA en el proveedor'),
    ).toHaveValue('XDWH.DE')
    await expect(liveMarket.instrument('XDWH.XETRA').getByLabel('Símbolo a mostrar')).toHaveValue(
      'XDWH.XETRA',
    )
    await liveMarket.closeQuote()
    await tracker.waitForSync()
    await tracker.reload()
    await tracker.openSettingsTab('Cotizaciones')
    await page.getByRole('button', { name: 'Editar cotización de XDWH.XETRA' }).click()
    await expect(
      liveMarket.instrument('XDWH.XETRA').getByLabel('Ticker de XDWH.XETRA en el proveedor'),
    ).toHaveValue('XDWH.DE')
  })

  test('suma movimientos AGED al instrumento configurado como AGED.MI', async ({
    page,
    tracker,
  }) => {
    await page.route('**/api/market/quotes', async (route) => {
      const body = route.request().postDataJSON() as {
        instruments?: Array<{ id: string; currency: string }>
      }
      const instrument = body.instruments?.[0]
      const quotes = instrument
        ? {
            [instrument.id]: {
              instrumentId: instrument.id,
              price: 9.276,
              currency: instrument.currency,
              timestamp: new Date().toISOString(),
              source: 'yahoo',
              status: 'fresh',
              isStale: false,
              previousClose: 9.312,
              changePercent: -0.39,
            },
          }
        : {}
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ quotes }),
      })
    })

    const liveMarket = new LiveMarketPage(page)
    await tracker.addInvestmentMovement({
      date: '2026-07-10',
      time: '09:30',
      side: 'buy',
      symbol: 'AGED',
      category: 'ETF AGED',
      unitPrice: 9,
      units: 5,
      fee: 0,
    })
    await tracker.openSettings()
    await liveMarket.addInstrument({
      asset: 'ETF AGED',
      type: 'etf',
      symbol: 'AGED.MI',
      currency: 'EUR',
      provider: 'yahoo',
      keepOpen: true,
    })

    const row = liveMarket.instrument('AGED.MI')
    await expect(row).toContainText('1 por vincular')
    await liveMarket.linkExistingMovements('AGED.MI')
    await expect(row).toContainText('1 vinculados')
    await liveMarket.closeQuote()

    await tracker.openInvestmentDashboardTab()
    await expect(
      page.locator('#investment [data-investment-quotes]').getByLabel('Títulos de AGED.MI'),
    ).toHaveValue('5')
  })

  test('permite vincular un movimiento legacy de ETF AGED sin símbolo', async ({
    page,
    tracker,
  }) => {
    await tracker.addInvestmentMovement({
      date: '2026-07-10',
      time: '09:30',
      side: 'buy',
      symbol: 'AGED',
      category: 'ETF AGED',
      unitPrice: 9,
      units: 5,
      fee: 0,
    })
    await editScenarioState(page, (state) => {
      const movement = state.transactions.find((transaction) => transaction.symbol === 'AGED')
      if (!movement) throw new Error('No se encontró el movimiento legacy')
      delete movement.symbol
      state.meta = { ...(state.meta || {}), savedAt: new Date(Date.now() + 60_000).toISOString() }
    })
    await tracker.reload()

    const liveMarket = new LiveMarketPage(page)
    await tracker.openSettings()
    await liveMarket.addInstrument({
      asset: 'ETF AGED',
      type: 'etf',
      symbol: 'AGED.MI',
      currency: 'EUR',
      provider: 'yahoo',
      keepOpen: true,
    })

    const row = liveMarket.instrument('AGED.MI')
    await expect(row).toContainText('1 por vincular')
    await liveMarket.linkExistingMovements('AGED.MI')
    await expect(row).toContainText('1 vinculados')
  })

  test('crea, edita, confirma pendientes y evita duplicados al recargar', async ({
    page,
    tracker,
  }) => {
    await page.addInitScript(() => {
      ;(window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__ = '2026-07-10'
    })
    await page.evaluate(() => {
      ;(window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__ = '2026-07-10'
    })
    const liveMarket = new LiveMarketPage(page)
    await tracker.openInvestmentRecurringTab()
    await liveMarket.createRecurringRule({
      account: 'Revolut',
      category: 'Fondos Indexados',
      description: 'Compra VWCE recurrente',
      amount: 100,
      frequency: 'daily',
      startDate: '2026-07-08',
      symbol: 'VWCE',
      units: 1,
      unitPrice: 100,
    })

    await tracker.openDashboard()
    await expect(liveMarket.dashboardPending.locator('[data-pending-item]')).toHaveCount(3)
    await tracker.openTransactions()
    await expect(page).toHaveURL(/\/movimientos$/)
    await expect(liveMarket.pendingPanel).toBeVisible()
    await liveMarket.expectPendingCount(3)

    const pendingItem = await liveMarket.openFirstPendingEdit()
    const descriptionInput = pendingItem.getByLabel('Descripción')
    const accountSelect = pendingItem.getByLabel('Cuenta')
    await expect(descriptionInput).toHaveCSS('min-height', '44px')
    await expect(descriptionInput).toHaveCSS('border-radius', '11px')
    await expect(accountSelect).toHaveCSS('min-height', '44px')
    await descriptionInput.fill('Compra VWCE editada')
    await pendingItem.getByLabel('Precio por título').fill('105')
    await pendingItem.getByRole('button', { name: 'Guardar edición' }).click()
    await expect(liveMarket.pendingPanel).toContainText('Compra VWCE editada')
    await liveMarket.confirmFirstPending()
    await expect(
      liveMarket.pendingPanel.getByRole('heading', { name: /Pendientes de revisar\s*2$/ }),
    ).toBeVisible()
    // Two clocks are in play: `__FINANCE_TODAY__` pins the recurring engine to
    // 2026-07-10 (only `src/stores/recurring.ts` reads it), while the
    // registry's band defaults to the *real* month (`src/stores/ui.ts`). The
    // confirmed movement is dated July, so move the band to July explicitly
    // instead of relying on the two happening to agree.
    await tracker.filterTransactionsMonth('JULIO')
    await expect(tracker.transactionsSection).toContainText('Compra VWCE editada')

    await tracker.reload()
    await expect(liveMarket.pendingPanel).toBeVisible()
    await liveMarket.expectPendingCount(2)
    await expect(
      liveMarket.pendingPanel
        .locator('[data-pending-item]')
        .filter({ hasText: 'Compra VWCE editada' }),
    ).toHaveCount(0)
  })

  test('permite editar los campos de inversión de un pendiente automatizado', async ({
    page,
    tracker,
  }) => {
    await page.addInitScript(() => {
      ;(window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__ = '2026-07-10'
    })
    await page.evaluate(() => {
      ;(window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__ = '2026-07-10'
    })
    const liveMarket = new LiveMarketPage(page)
    await tracker.openInvestmentRecurringTab()
    await liveMarket.createRecurringRule({
      account: 'Revolut',
      category: 'Fondos Indexados',
      description: 'Aportación VWCE',
      amount: 100,
      frequency: 'monthly',
      startDate: '2026-07-01',
      type: 'investment',
      symbol: 'VWCE',
      units: 1,
      unitPrice: 100,
      fee: 0,
      time: '09:00',
    })

    await tracker.openDashboard()
    await expect(liveMarket.dashboardPending.locator('[data-pending-item]')).not.toHaveCount(0)
    await tracker.openTransactions()
    await expect(liveMarket.pendingPanel).toBeVisible()
    await liveMarket.expectPendingCount(1)
    await expect(liveMarket.pendingPanel).toContainText('1 × 100 VWCE')

    await liveMarket.editFirstPendingInvestment({
      units: 2,
      unitPrice: 105.5,
      fee: 1.5,
      time: '10:30',
    })
    await expect(liveMarket.pendingPanel).toContainText('212,50 €')
    await expect(liveMarket.pendingPanel).toContainText('2 × 105.5 VWCE')

    await liveMarket.confirmFirstPending()
    // See the note above: the movement lands in July (pinned engine clock),
    // while the table filter defaults to the real month.
    await tracker.filterTransactionsMonth('JULIO')
    await expect(tracker.transactionsSection).toContainText('Aportación VWCE')
    await expect(tracker.transactionsSection).toContainText('212,50')
  })

  test('permite reclasificar un pendiente de gasto a inversión con cuenta y categoría dinámica', async ({
    page,
    tracker,
  }) => {
    await page.addInitScript(() => {
      ;(window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__ = '2026-07-10'
    })
    await page.evaluate(() => {
      ;(window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__ = '2026-07-10'
    })
    await editScenarioState(page, (state) => {
      state.recurringRules.push({
        id: 'rule-expense-reclass',
        type: 'expense',
        accountId: state.accounts[0].id,
        category: state.expenseCategories[0],
        description: 'Suscripción convertible',
        amount: 50,
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-07-01',
        endDate: null,
        active: true,
        lastExecutionDate: null,
        nextOccurrenceDate: '2026-07-01',
      })
    })
    await tracker.reload()

    const liveMarket = new LiveMarketPage(page)
    await tracker.openDashboard()
    await expect(liveMarket.dashboardPending.locator('[data-pending-item]')).not.toHaveCount(0)
    await tracker.openTransactions()
    await expect(liveMarket.pendingPanel).toBeVisible()

    const pendingItem = await liveMarket.openFirstPendingEdit()
    const typeControl = pendingItem.getByRole('group', { name: 'Tipo de movimiento' })
    const categorySelect = pendingItem.getByLabel('Categoría')
    const accountSelect = pendingItem.getByLabel('Cuenta')

    await expect(typeControl.getByRole('button', { name: 'Gasto' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await typeControl.getByRole('button', { name: 'Inversión' }).click()

    await expect(categorySelect.locator('option[value="Fondos Indexados"]')).toBeAttached()
    await categorySelect.selectOption('Fondos Indexados')

    await expect(accountSelect.locator('optgroup[label="Activos de inversión"]')).toBeAttached()
    await accountSelect.selectOption({ label: 'Fondos Indexados' })

    await pendingItem.getByLabel('Símbolo').fill('IWDA')
    await pendingItem.getByLabel('Títulos').fill('2')
    await pendingItem.getByLabel('Precio por título').fill('90')
    await pendingItem.getByLabel('Comisiones').fill('2')
    await pendingItem.getByLabel('Hora').fill('11:00')

    await pendingItem.getByRole('button', { name: 'Guardar edición' }).click()

    await expect(liveMarket.pendingPanel).toContainText('182,00 €')
    await expect(liveMarket.pendingPanel).toContainText('2 × 90 IWDA')

    await liveMarket.confirmFirstPending()
    await tracker.filterTransactionsMonth('JULIO')
    await expect(tracker.transactionsSection).toContainText('Suscripción convertible')
    await expect(tracker.transactionsSection).toContainText('182,00')
  })

  test('permite editar una regla de inversión recurrente', async ({ page, tracker }) => {
    await page.addInitScript(() => {
      ;(window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__ = '2026-07-10'
    })
    const liveMarket = new LiveMarketPage(page)
    await tracker.openInvestmentRecurringTab()
    await liveMarket.createRecurringRule({
      account: 'Revolut',
      category: 'Fondos Indexados',
      description: 'Aportación VWCE',
      amount: 100,
      frequency: 'monthly',
      startDate: '2026-07-10',
      type: 'investment',
      symbol: 'VWCE',
      units: 1,
      unitPrice: 100,
      fee: 0,
      time: '09:00',
    })

    await liveMarket.editFirstRecurringRule({
      description: 'Aportación VWCE actualizada',
      amount: 212.5,
      units: 2,
      unitPrice: 105.5,
      fee: 1.5,
      time: '10:30',
    })
    await expect(liveMarket.recurringRules).toContainText('Aportación VWCE actualizada')
    await expect(liveMarket.recurringRules).toContainText('212,50 €')
  })

  test('avisa cuando el proveedor devuelve un dato obsoleto', async ({ page, tracker }) => {
    await page.route('**/api/market/quotes', async (route) => {
      const body = route.request().postDataJSON() as {
        instruments?: Array<{ id: string; currency: string }>
      }
      const quotes = Object.fromEntries(
        (body.instruments || []).map((instrument) => [
          instrument.id,
          {
            instrumentId: instrument.id,
            price: 90,
            currency: instrument.currency,
            timestamp: '2020-01-01T00:00:00Z',
            source: 'mock-provider',
            status: 'fresh',
            isStale: false,
            previousClose: 100,
            changePercent: -10,
          },
        ]),
      )
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ quotes }),
      })
    })
    const liveMarket = new LiveMarketPage(page)
    await tracker.openSettings()
    await liveMarket.addInstrument({
      asset: 'ETF Plata',
      type: 'etf',
      symbol: 'STALE',
      currency: 'EUR',
    })
    await tracker.openInvestmentDashboardTab()
    const panel = page.locator('#investment [data-investment-quotes]')
    await expect(panel.getByText('Retrasado')).toBeVisible()
  })

  test('vincula movimientos de inversión existentes por símbolo', async ({ page, tracker }) => {
    const liveMarket = new LiveMarketPage(page)
    await tracker.addInvestmentMovement({
      date: '2026-07-10',
      time: '09:30',
      side: 'buy',
      symbol: 'LINKED',
      category: 'ETF Plata',
      unitPrice: 100,
      units: 2,
      fee: 0,
    })
    await tracker.openSettings()
    await liveMarket.addInstrument({
      asset: 'ETF Plata',
      type: 'etf',
      symbol: 'LINKED',
      currency: 'EUR',
      keepOpen: true,
    })

    const row = liveMarket.instrument('LINKED')
    await expect(row).toContainText('1 por vincular')
    await liveMarket.linkExistingMovements('LINKED')
    await expect(row).toContainText('1 vinculados')
    await expect(row).not.toContainText('por vincular')
    await liveMarket.closeQuote()

    await tracker.openInvestmentDashboardTab()
    await expect(
      page.locator('#investment [data-investment-quotes]').getByLabel('Títulos de LINKED'),
    ).toHaveValue('2')
  })
})
