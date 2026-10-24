import { test, expect } from './fixtures'
import { editScenarioState, readScenarioState } from './seed-sync-v2'
import { LiveMarketPage } from './pages/LiveMarketPage'

test.describe('Settings E2E', () => {
  for (const provider of ['Stock Events', 'Bitvavo']) {
    test(
      `abre los ajustes de ${provider} desde Conexiones y devuelve el foco al cerrar`,
      { tag: '@smoke' },
      async ({ page, tracker }) => {
        await tracker.openSettingsTab('Conexiones')
        const connections = tracker
          .section('settings')
          .getByRole('region', { name: 'Conexiones', exact: true })
        const launcher = connections.getByRole('button', { name: provider, exact: true })
        await expect(launcher).toBeVisible()
        await launcher.click()
        const panel = page.getByRole('dialog', { name: provider, exact: true })
        await expect(panel).toBeVisible()
        await expect(panel.getByLabel('API key', { exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(panel).toBeHidden()
        await expect(launcher).toBeFocused()
      },
    )
  }

  test(
    'muestra Configuración por entidades, con pestañas y contadores',
    { tag: '@smoke' },
    async ({ page, tracker }) => {
      await tracker.openSettings()
      const settings = tracker.section('settings')

      await expect(page.locator('[data-finance-workspace] #settings')).toBeVisible()
      await expect(
        settings.getByRole('heading', { name: 'Configuración', exact: true }),
      ).toBeVisible()
      await expect(settings.getByRole('tab', { name: /Cuentas/ })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await expect(settings.locator('tr[data-account-id]').first()).toBeVisible()

      await settings.getByRole('tab', { name: /Activos/ }).click()
      await expect(settings.locator('tr[data-asset-id]')).toHaveCount(9)
      await expect(settings.locator('#settings-tab-accounts')).toBeHidden()
    },
  )

  test('configura cotizaciones por símbolo aunque compartan categoría o no tengan activo', async ({
    page,
    tracker,
  }) => {
    await editScenarioState(page, (state) => {
      state.instruments = []
      for (const [index, symbol] of ['FIRST', 'SECOND', 'ORPH'].entries()) {
        state.transactions.push({
          id: `tx-quote-${index}`,
          type: 'investment',
          date: '2026-07-01',
          amount: 100,
          month: 6,
          createdAt: '2026-07-01T00:00:00Z',
          category: symbol === 'ORPH' ? 'Sin activo' : 'ETF AGED',
          accountId: 'revolut',
          description: `Compra ${symbol}`,
          side: 'buy',
          symbol,
          units: 1,
          unitPrice: 100,
          fee: 0,
        })
      }
    })
    await tracker.openSettingsTab('Cotizaciones')
    const quotes = tracker.section('settings').locator('[data-settings-quotes]')
    const first = quotes.locator('tr[data-quote-symbol="FIRST"]')
    const second = quotes.locator('tr[data-quote-symbol="SECOND"]')
    await expect(first).toContainText('Sin configurar')
    await expect(second).toContainText('Sin configurar')
    await expect(quotes.locator('tr[data-quote-symbol="ORPH"]')).toBeVisible()

    await first.getByRole('button', { name: 'Configurar cotización de FIRST' }).click()
    const market = new LiveMarketPage(page)
    const form = market.quotePanel.locator('[data-instrument-form]')
    await expect(form.getByLabel('Símbolo', { exact: true })).toHaveValue('FIRST')
    await expect(form.getByLabel('Activo de agrupación')).toHaveValue('etf-aged')
    await form.getByLabel('Símbolo', { exact: true }).fill('FIRST.DE')
    await form.getByRole('button', { name: 'Añadir instrumento' }).click()
    await expect(market.instrument('FIRST.DE')).toBeVisible()
    await market.closeQuote()

    await expect(quotes.locator('tr[data-quote-symbol="FIRST.DE"]')).toContainText('Yahoo')
    await expect(first).toHaveCount(0)
    await expect(second).toContainText('Sin configurar')
    await tracker.openSettingsTab('Activos')
    const asset = await tracker.openSettingsCard('Activos', 'ETF AGED')
    await expect(asset.getByRole('button', { name: 'Guardar símbolos' })).toHaveCount(0)
  })

  test('crea una cuenta desde su ficha y la ofrece al registrar movimientos', async ({
    tracker,
    page,
  }) => {
    await tracker.addAccount({ name: 'Cuenta Vacaciones', openingBalance: 500 })

    const settings = tracker.section('settings')
    await expect(
      settings.locator('tr[data-account-id]').filter({ hasText: 'Cuenta Vacaciones' }),
    ).toContainText('500,00')

    await tracker.openTransactions()
    await tracker.transactionsSection.getByRole('button', { name: 'Nuevo movimiento' }).click()
    await expect(page.locator("#tx-panel select[name='accountId']")).toContainText(
      'Cuenta Vacaciones',
    )
  })

  test('edita el nombre y el saldo inicial de una cuenta en su ficha', async ({ tracker }) => {
    const panel = await tracker.openSettingsCard('Cuentas', 'Openbank')
    await panel.getByLabel('Nombre').fill('Openbank Ahorro')
    await panel.getByLabel('Saldo inicial (€)').fill('1.234,5')
    await panel.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(panel).toBeHidden()

    await expect(
      tracker
        .section('settings')
        .locator('tr[data-account-id]')
        .filter({ hasText: 'Openbank Ahorro' }),
    ).toContainText('1.234,50')
  })

  test('añade, reordena y elimina una categoría de gasto', async ({ tracker, page }) => {
    await tracker.openSettingsTab('Categorías')
    const expenses = tracker.section('settings').locator('[data-category-list="expenseCategories"]')

    await expenses.getByLabel('Nueva categoría de gastos').fill('Mascotas')
    await expenses.getByRole('button', { name: 'Añadir' }).click()
    const item = expenses.locator('[data-category="Mascotas"]')
    await expect(item).toBeVisible()
    await expect(expenses.locator('[data-category]').last()).toHaveAttribute(
      'data-category',
      'Mascotas',
    )

    await item.getByRole('button', { name: 'Subir Mascotas' }).click()
    await expect(expenses.locator('[data-category]').last()).not.toHaveAttribute(
      'data-category',
      'Mascotas',
    )

    await item.getByRole('button', { name: 'Eliminar categoría Mascotas' }).click()
    const confirm = page.getByRole('alertdialog', { name: '¿Eliminar esta categoría?' })
    await expect(confirm).toContainText('Mascotas')
    await confirm.getByRole('button', { name: 'Eliminar categoría' }).click()
    await expect(item).toHaveCount(0)
  })

  test('configura la lista y el ticker de Stock Events en la ficha del activo', async ({
    tracker,
    page,
  }) => {
    await page.route('**/api/integrations/stockevents', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"configured":true}' }),
    )
    await page.route('**/api/stockevents/watchlists', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          watchlists: [
            { id: 'wl-acciones', name: 'Acciones' },
            { id: 'wl-etf', name: 'ETF' },
          ],
        }),
      }),
    )

    await editScenarioState(page, (state) => {
      state.instruments.push({
        id: 'instrument-aged',
        investmentAssetId: 'etf-aged',
        type: 'etf',
        symbol: 'AGED',
        market: 'MI',
        currency: 'EUR',
        provider: 'manual',
        active: true,
      })
      state.stockEvents = {
        enabled: true,
        apiKey: '',
        symbolMappings: [
          {
            symbol: 'AGED',
            sync: true,
            watchlistId: 'wl-acciones',
            targetSymbol: 'AGED.MI',
            hidden: false,
          },
        ],
      }
    })
    await tracker.openSettingsTab('Activos')
    const row = tracker.section('settings').locator('tr[data-asset-id="etf-aged"]')
    await expect(row).toContainText('AGED')
    await expect(row).toContainText('Acciones')

    const panel = await tracker.openSettingsCard('Activos', 'ETF AGED')
    const watchlist = panel.getByRole('combobox', { name: 'Lista de seguimiento de AGED' })
    const target = panel.getByRole('textbox', { name: 'Símbolo en Stock Events de AGED' })
    await expect(watchlist).toBeEnabled()
    await target.fill('aged.xetra')
    await target.press('Tab')
    await watchlist.selectOption('wl-etf')
    await expect(watchlist).toHaveValue('wl-etf')
    await expect(target).toHaveValue('AGED.XETRA')
    await tracker.waitForSync()

    await tracker.reload()
    await expect
      .poll(async () => (await readScenarioState(page)).stockEvents.symbolMappings)
      .toContainEqual(expect.objectContaining({ symbol: 'AGED', watchlistId: 'wl-etf' }))
    const reopened = await tracker.openSettingsCard('Activos', 'ETF AGED')
    await expect(
      reopened.getByRole('combobox', { name: 'Lista de seguimiento de AGED' }),
    ).toHaveValue('wl-etf')
    await expect(
      reopened.getByRole('textbox', { name: 'Símbolo en Stock Events de AGED' }),
    ).toHaveValue('AGED.XETRA')
  })

  test('oculta y vuelve a mostrar un símbolo que no es de ningún activo', async ({
    tracker,
    page,
  }) => {
    await editScenarioState(page, (state) => {
      state.transactions.push({
        id: 'tx-orphan',
        type: 'investment',
        date: '2026-07-01',
        amount: 50,
        month: 6,
        createdAt: '2026-07-01T00:00:00Z',
        side: 'buy',
        units: 1,
        unitPrice: 50,
        fee: 0,
        category: 'Sin activo',
        description: 'Compra suelta',
        accountId: 'revolut',
        symbol: 'ORPH',
      })
    })
    await tracker.openSettingsTab('Activos')

    const orphans = tracker.section('settings').locator('[data-orphan-symbols]')
    await expect(orphans.locator('[data-symbol-sync="ORPH"]')).toBeVisible()

    await orphans.getByRole('button', { name: 'Ocultar ORPH' }).click()
    await expect(orphans.locator('[data-symbol-sync="ORPH"]')).toHaveCount(0)
    await expect(orphans).toContainText('Todos están ocultos.')

    await orphans.getByText('Mostrar ocultos (1)').click()
    await orphans.getByRole('button', { name: 'Mostrar ORPH' }).click()
    await expect(orphans.getByText(/Mostrar ocultos/)).toHaveCount(0)
    await expect(orphans.locator('[data-symbol-sync="ORPH"]')).toBeVisible()
  })
})
