import { test, expect, mirrorStateToServer } from './fixtures'
import { LiveMarketPage } from './pages/LiveMarketPage'

test.describe('precios de mercado y movimientos recurrentes', () => {
  test('configura un instrumento y muestra una cotización mockeada con actualización', async ({ page, tracker }) => {
    await page.route('**/api/market/quotes', async (route) => {
      const body = route.request().postDataJSON() as { instruments?: Array<{ id: string; currency: string }> }
      const now = new Date().toISOString()
      const quotes = Object.fromEntries((body.instruments || []).map((instrument) => [instrument.id, {
        instrumentId: instrument.id, price: 125.5, currency: instrument.currency, timestamp: now,
        source: 'mock-provider', status: 'fresh', isStale: false, previousClose: 124, changePercent: 1.21,
      }]))
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quotes }) })
    })

    await tracker.openSettings()
    const liveMarket = new LiveMarketPage(page)
    await liveMarket.addInstrument({ asset: 'ETF Plata', type: 'etf', symbol: 'VWCE', currency: 'EUR' })
    await tracker.openDashboard()

    const panel = page.locator('#dashboard [data-market-panel]')
    await expect(panel.getByText('VWCE', { exact: true })).toBeVisible()
    await expect(panel.getByText('Actualizado')).toBeVisible()
    await expect(panel.getByText('125,5')).toBeVisible()
    const holdingsInput = panel.getByLabel('Títulos de VWCE')
    await expect(holdingsInput).toHaveValue('0')
    await holdingsInput.fill('0.25')
    await holdingsInput.press('Tab')
    await expect(holdingsInput).toHaveValue('0.25')
    await expect(panel).toContainText('Última')
  })

  test('configura Yahoo Finance para cotizaciones europeas como AGED.MI', async ({ page, tracker }) => {
    let requestedProvider = ''
    await page.route('**/api/market/quotes', async (route) => {
      const body = route.request().postDataJSON() as { instruments?: Array<{ id: string; provider: string; currency: string }> }
      requestedProvider = body.instruments?.[0]?.provider || ''
      const instrument = body.instruments?.[0]
      const quotes = instrument ? {
        [instrument.id]: {
          instrumentId: instrument.id, price: 9.276, currency: instrument.currency,
          timestamp: new Date().toISOString(), source: 'yahoo', status: 'fresh',
          isStale: false, previousClose: 9.312, changePercent: -0.39,
        },
      } : {}
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quotes }) })
    })

    await tracker.openSettings()
    const liveMarket = new LiveMarketPage(page)
    await liveMarket.addInstrument({
      asset: 'ETF AGED', type: 'etf', symbol: 'AGED.MI', currency: 'EUR', provider: 'yahoo',
    })
    await tracker.openDashboard()

    const panel = page.locator('#dashboard [data-market-panel]')
    await expect(panel.getByText('AGED.MI', { exact: true })).toBeVisible()
    await expect(panel.getByText('9,28')).toBeVisible()
    expect(requestedProvider).toBe('yahoo')
  })

  test('busca y guarda el símbolo fuente aproximado de un ETF', async ({ page, tracker }) => {
    await page.route('**/api/market/search**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [{
          symbol: 'XDWH.DE', name: 'Xtrackers MSCI World Health Care UCITS ETF 1C',
          exchange: 'XETRA', currency: 'EUR', type: 'ETF',
        }] }),
      })
    })

    await tracker.openSettings()
    const liveMarket = new LiveMarketPage(page)
    await liveMarket.addInstrument({
      asset: 'ETF XDWH', type: 'etf', symbol: 'XDWH.XETRA', currency: 'EUR', provider: 'yahoo',
    })
    await liveMarket.searchSourceSymbol('XDWH.XETRA', 'XDWH.XETRA')
    await liveMarket.selectSourceSearchResult('XDWH.XETRA', 'XDWH.DE')
    await liveMarket.saveSourceSymbol('XDWH.XETRA')

    await expect(liveMarket.instrumentEditor.getByText('XDWH.DE', { exact: true })).toBeVisible()
  })

  test('suma movimientos AGED al instrumento configurado como AGED.MI', async ({ page, tracker }) => {
    await page.route('**/api/market/quotes', async (route) => {
      const body = route.request().postDataJSON() as { instruments?: Array<{ id: string; currency: string }> }
      const instrument = body.instruments?.[0]
      const quotes = instrument ? {
        [instrument.id]: {
          instrumentId: instrument.id, price: 9.276, currency: instrument.currency,
          timestamp: new Date().toISOString(), source: 'yahoo', status: 'fresh',
          isStale: false, previousClose: 9.312, changePercent: -0.39,
        },
      } : {}
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quotes }) })
    })

    const liveMarket = new LiveMarketPage(page)
    await tracker.addInvestmentMovement({
      date: '2026-07-10', time: '09:30', side: 'buy', symbol: 'AGED',
      category: 'ETF AGED', unitPrice: 9, units: 5, fee: 0,
    })
    await tracker.openSettings()
    await liveMarket.addInstrument({
      asset: 'ETF AGED', type: 'etf', symbol: 'AGED.MI', currency: 'EUR', provider: 'yahoo',
    })

    const row = liveMarket.instrumentEditor.getByRole('listitem').filter({ hasText: 'AGED.MI' })
    await expect(row).toContainText('1 por vincular')
    await liveMarket.linkExistingMovements('AGED.MI')
    await expect(row).toContainText('1 vinculados')

    await tracker.openDashboard()
    await expect(page.locator('#dashboard [data-market-panel]').getByLabel('Títulos de AGED.MI')).toHaveValue('5')
  })

  test('permite vincular un movimiento legacy de ETF AGED sin símbolo', async ({ page, tracker }) => {
    await tracker.addInvestmentMovement({
      date: '2026-07-10', time: '09:30', side: 'buy', symbol: 'AGED',
      category: 'ETF AGED', unitPrice: 9, units: 5, fee: 0,
    })
    await page.evaluate(() => {
      const raw = localStorage.getItem('finance-tracker-state-v1')
      if (!raw) throw new Error('No se encontró el estado local')
      const state = JSON.parse(raw) as { transactions: Array<{ symbol?: string }>; meta?: { savedAt?: string } }
      const movement = state.transactions.find((transaction) => transaction.symbol === 'AGED')
      if (!movement) throw new Error('No se encontró el movimiento legacy')
      delete movement.symbol
      state.meta = { ...(state.meta || {}), savedAt: new Date(Date.now() + 60_000).toISOString() }
      localStorage.setItem('finance-tracker-state-v1', JSON.stringify(state))
    })
    await mirrorStateToServer(page)
    await page.reload()

    const liveMarket = new LiveMarketPage(page)
    await tracker.openSettings()
    await liveMarket.addInstrument({
      asset: 'ETF AGED', type: 'etf', symbol: 'AGED.MI', currency: 'EUR', provider: 'yahoo',
    })

    const row = liveMarket.instrumentEditor.getByRole('listitem').filter({ hasText: 'AGED.MI' })
    await expect(row).toContainText('1 por vincular')
    await liveMarket.linkExistingMovements('AGED.MI')
    await expect(row).toContainText('1 vinculados')
  })

  test('crea, edita, confirma pendientes y evita duplicados al recargar', async ({ page, tracker }) => {
    await page.addInitScript(() => {
      ;(window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__ = '2026-07-10'
    })
    await page.evaluate(() => {
      ;(window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__ = '2026-07-10'
    })
    const liveMarket = new LiveMarketPage(page)
    await tracker.openInvestmentRecurringTab()
    await liveMarket.createRecurringRule({
      account: 'Revolut', category: 'Fondos Indexados', description: 'Compra VWCE recurrente', amount: 100,
      frequency: 'daily', startDate: '2026-07-08', symbol: 'VWCE', units: 1, unitPrice: 100,
    })

    await tracker.openDashboard()
    await expect(liveMarket.pendingAlert).toContainText('3 movimientos pendientes')
    await liveMarket.pendingAlert.getByRole('button', { name: 'Revisar pendientes' }).click()
    await expect(page).toHaveURL(/\/movimientos$/)
    await expect(liveMarket.pendingPanel).toBeVisible()
    await liveMarket.expectPendingCount(3)

    const pendingItem = await liveMarket.openFirstPendingEdit()
    const descriptionInput = pendingItem.getByLabel('Descripción')
    const accountSelect = pendingItem.getByLabel('Cuenta')
    await expect(descriptionInput).toHaveCSS('min-height', '42px')
    await expect(descriptionInput).toHaveCSS('border-radius', '11px')
    await expect(accountSelect).toHaveCSS('min-height', '42px')
    await descriptionInput.fill('Compra VWCE editada')
    await pendingItem.getByLabel('Precio por título').fill('105')
    await pendingItem.getByRole('button', { name: 'Guardar edición' }).click()
    await expect(liveMarket.pendingPanel).toContainText('Compra VWCE editada')
    await liveMarket.confirmFirstPending()
    await expect(liveMarket.pendingPanel).toContainText('(2)')
    // Two clocks are in play: `__FINANCE_TODAY__` pins the recurring engine to
    // 2026-07-10 (only `src/stores/recurring.ts` reads it), while the table's
    // month filter defaults to the *real* month (`src/stores/ui.ts`). The
    // confirmed movement is dated July, so select July explicitly instead of
    // relying on the two happening to agree — which is why this passed only
    // while the wall clock was in July.
    await tracker.filterTransactionsMonth('JULIO')
    await expect(tracker.transactionsSection).toContainText('Compra VWCE editada')

    await page.reload()
    await expect(liveMarket.pendingPanel).toBeVisible()
    await liveMarket.expectPendingCount(2)
    await expect(liveMarket.pendingPanel.locator('[data-pending-item]').filter({ hasText: 'Compra VWCE editada' })).toHaveCount(0)
  })

  test('permite editar los campos de inversión de un pendiente automatizado', async ({ page, tracker }) => {
    await page.addInitScript(() => {
      ;(window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__ = '2026-07-10'
    })
    await page.evaluate(() => {
      ;(window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__ = '2026-07-10'
    })
    const liveMarket = new LiveMarketPage(page)
    await tracker.openInvestmentRecurringTab()
    await liveMarket.createRecurringRule({
      account: 'Revolut', category: 'Fondos Indexados', description: 'Aportación VWCE', amount: 100,
      frequency: 'monthly', startDate: '2026-07-01',
      type: 'investment', symbol: 'VWCE', units: 1, unitPrice: 100, fee: 0, time: '09:00',
    })

    await tracker.openDashboard()
    await liveMarket.pendingAlert.getByRole('button', { name: 'Revisar pendientes' }).click()
    await expect(liveMarket.pendingPanel).toBeVisible()
    await liveMarket.expectPendingCount(1)
    await expect(liveMarket.pendingPanel).toContainText('1 × 100 VWCE')

    await liveMarket.editFirstPendingInvestment({ units: 2, unitPrice: 105.5, fee: 1.5, time: '10:30' })
    await expect(liveMarket.pendingPanel).toContainText('212.50')
    await expect(liveMarket.pendingPanel).toContainText('2 × 105.5 VWCE')

    await liveMarket.confirmFirstPending()
    // See the note above: the movement lands in July (pinned engine clock),
    // while the table filter defaults to the real month.
    await tracker.filterTransactionsMonth('JULIO')
    await expect(tracker.transactionsSection).toContainText('Aportación VWCE')
    await expect(tracker.transactionsSection).toContainText('212,50')
  })

  test('permite editar una regla de inversión recurrente', async ({ page, tracker }) => {
    await page.addInitScript(() => {
      ;(window as Window & { __FINANCE_TODAY__?: string }).__FINANCE_TODAY__ = '2026-07-10'
    })
    const liveMarket = new LiveMarketPage(page)
    await tracker.openInvestmentRecurringTab()
    await liveMarket.createRecurringRule({
      account: 'Revolut', category: 'Fondos Indexados', description: 'Aportación VWCE', amount: 100,
      frequency: 'monthly', startDate: '2026-07-10',
      type: 'investment', symbol: 'VWCE', units: 1, unitPrice: 100, fee: 0, time: '09:00',
    })

    await liveMarket.editFirstRecurringRule({ description: 'Aportación VWCE actualizada', amount: 212.5, units: 2, unitPrice: 105.5, fee: 1.5, time: '10:30' })
    await expect(liveMarket.recurringRules).toContainText('Aportación VWCE actualizada')
    await expect(liveMarket.recurringRules).toContainText('212.50')
  })

  test('avisa cuando el proveedor devuelve un dato obsoleto', async ({ page, tracker }) => {
    await page.route('**/api/market/quotes', async (route) => {
      const body = route.request().postDataJSON() as { instruments?: Array<{ id: string; currency: string }> }
      const quotes = Object.fromEntries((body.instruments || []).map((instrument) => [instrument.id, {
        instrumentId: instrument.id, price: 90, currency: instrument.currency, timestamp: '2020-01-01T00:00:00Z',
        source: 'mock-provider', status: 'fresh', isStale: false, previousClose: 100, changePercent: -10,
      }]))
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ quotes }) })
    })
    const liveMarket = new LiveMarketPage(page)
    await tracker.openSettings()
    await liveMarket.addInstrument({ asset: 'ETF Plata', type: 'etf', symbol: 'STALE', currency: 'EUR' })
    await tracker.openDashboard()
    const panel = page.locator('#dashboard [data-market-panel]')
    await expect(panel.getByText('Retrasado')).toBeVisible()
    await expect(panel).toContainText('Última actualización')
  })

  test('vincula movimientos de inversión existentes por símbolo', async ({ page, tracker }) => {
    const liveMarket = new LiveMarketPage(page)
    await tracker.addInvestmentMovement({
      date: '2026-07-10', time: '09:30', side: 'buy', symbol: 'LINKED',
      category: 'ETF Plata', unitPrice: 100, units: 2, fee: 0,
    })
    await tracker.openSettings()
    await liveMarket.addInstrument({ asset: 'ETF Plata', type: 'etf', symbol: 'LINKED', currency: 'EUR' })

    const row = liveMarket.instrumentEditor.getByRole('listitem').filter({ hasText: 'LINKED' })
    await expect(row).toContainText('1 por vincular')
    await liveMarket.linkExistingMovements('LINKED')
    await expect(row).toContainText('1 vinculados')
    await expect(row).toContainText('0 por vincular')

    await tracker.openDashboard()
    await expect(page.locator('#dashboard [data-market-panel]').getByLabel('Títulos de LINKED')).toHaveValue('2')
  })
})
