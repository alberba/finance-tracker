import { syncV2Test as test, expect } from './fixtures'
import type { Page } from '@playwright/test'

test.describe('Settings E2E', () => {
  test(
    'abre los ajustes del proveedor desde Conexiones y devuelve el foco al cerrar',
    { tag: '@smoke' },
    async ({ page, tracker }) => {
      await tracker.openSettingsTab('Conexiones')
      const connections = tracker
        .section('settings')
        .getByRole('region', { name: 'Conexiones', exact: true })
      const stockEvents = connections.getByRole('button', { name: 'Stock Events', exact: true })
      await expect(stockEvents).toBeVisible()
      await stockEvents.click()
      const panel = page.getByRole('dialog', { name: 'Stock Events', exact: true })
      await expect(panel).toBeVisible()
      await expect(panel.getByLabel('API key', { exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(panel).toBeHidden()
      await expect(stockEvents).toBeFocused()
    },
  )

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
      await expect(settings.getByText('Aún no hay cuentas.')).toBeVisible()

      await settings.getByRole('tab', { name: /Activos/ }).click()
      await settings.getByRole('button', { name: 'Nuevo activo' }).click()
      const panel = page.getByRole('dialog', { name: 'Nuevo activo' })
      await panel.getByLabel('Nombre').fill('ETF de prueba')
      await panel.getByLabel('Valor inicial (€)').fill('300')
      await panel.getByRole('button', { name: 'Crear activo' }).click()
      await expect(settings.locator('tr[data-asset-id]')).toHaveCount(1)
      await expect(settings.locator('#settings-tab-accounts')).toBeHidden()
    },
  )

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
    await tracker.addAccount({ name: 'Cuenta de origen', openingBalance: 50 })
    const panel = await tracker.openSettingsCard('Cuentas', 'Cuenta de origen')
    await panel.getByLabel('Nombre').fill('Cuenta de ahorro')
    await panel.getByLabel('Saldo inicial (€)').fill('1.234,5')
    await panel.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(panel).toBeHidden()

    await expect(
      tracker
        .section('settings')
        .locator('tr[data-account-id]')
        .filter({ hasText: 'Cuenta de ahorro' }),
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

  test('eliminar una cuenta pide confirmación y borra sus suscripciones pendientes', async ({
    tracker,
    page,
  }) => {
    const today = new Date().toISOString().slice(0, 10)
    await tracker.addAccount({ name: 'Revolut' })
    await tracker.addSubscription({
      name: 'Suscripción cuenta eliminada',
      amount: 12,
      categoryLabel: 'Comida',
      frequency: 'monthly',
      firstChargeDate: today,
    })

    const panel = await tracker.openSettingsCard('Cuentas', 'Revolut')
    await panel.getByRole('button', { name: 'Eliminar' }).click()
    const confirm = page.getByRole('alertdialog', { name: '¿Eliminar esta cuenta?' })
    await expect(confirm).toContainText('También se borran sus movimientos y suscripciones')
    await confirm.getByRole('button', { name: 'Eliminar cuenta' }).click()

    await expect(
      tracker
        .section('settings')
        .getByRole('button', { name: 'Abrir la ficha de Revolut', exact: true }),
    ).toHaveCount(0)
    await expect(page.getByRole('status')).toContainText('Elemento eliminado')

    await tracker.openSubscriptionsTab()
    await expect(
      tracker.transactionsSection
        .locator('#transactions-tab-subscriptions tr[data-subscription-id]')
        .filter({ hasText: 'Suscripción cuenta eliminada' }),
    ).toHaveCount(0)
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

    await tracker.openSettingsTab('Activos')
    await tracker.section('settings').getByRole('button', { name: 'Nuevo activo' }).click()
    const newAsset = page.getByRole('dialog', { name: 'Nuevo activo' })
    await newAsset.getByLabel('Nombre').fill('ETF AGED')
    await newAsset.getByLabel('Valor inicial (€)').fill('300')
    await newAsset.getByRole('button', { name: 'Crear activo' }).click()
    await expect(newAsset).toBeHidden()

    const assetPanel = await tracker.openSettingsCard('Activos', 'ETF AGED')
    const instrumentForm = assetPanel.locator('[data-instrument-form]')
    await instrumentForm.getByLabel('Símbolo').fill('AGED')
    await instrumentForm.getByLabel('Moneda').fill('EUR')
    await instrumentForm.getByLabel('Mercado / MIC (opcional)').fill('MI')
    await instrumentForm.getByRole('button', { name: 'Añadir instrumento' }).click()

    const row = tracker.section('settings').locator('tr[data-asset-id="etf-aged"]')
    await expect(row).toHaveCount(0)
    const createdRow = tracker.section('settings').locator('tr[data-asset-id]').filter({ hasText: 'ETF AGED' })
    await expect(createdRow).toContainText('AGED')

    const panel = await tracker.openSettingsCard('Activos', 'ETF AGED')
    const mapping = tracker.section('settings').locator('[data-symbol-sync="AGED"]')
    const watchlist = mapping.getByRole('combobox', { name: 'Lista de seguimiento de AGED' })
    const target = mapping.getByRole('textbox', { name: 'Símbolo en Stock Events de AGED' })
    await expect(watchlist).toBeEnabled()
    await target.fill('aged.xetra')
    await target.press('Tab')
    await watchlist.selectOption('wl-etf')
    await expect(watchlist).toHaveValue('wl-etf')
    await expect(target).toHaveValue('AGED.XETRA')
    await expect(page.locator('#sidebar-sync-status')).toContainText('Sincronizado')
    await expect(watchlist).toHaveValue('wl-etf')
    await expect(target).toHaveValue('AGED.XETRA')
  })

  test('oculta y vuelve a mostrar un símbolo que no es de ningún activo', async ({
    tracker,
    page,
  }) => {
    await tracker.addAccount({ name: 'Revolut' })
    await tracker.addInvestmentMovement({
      date: '2026-07-01',
      time: '09:30',
      side: 'buy',
      symbol: 'ORPH',
      category: 'Sin activo',
      unitPrice: 50,
      units: 1,
      fee: 0,
      brokerName: 'Revolut',
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
