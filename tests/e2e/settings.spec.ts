import { test, expect, mirrorStateToServer } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * Edits the stored state in the page and mirrors it to the server. `edit`
 * runs in the browser, so it can only use its argument.
 */
interface StoredState {
  instruments: unknown[]
  transactions: unknown[]
  stockEvents?: unknown
}

async function editState(page: Page, edit: (state: StoredState) => void) {
  await page.evaluate(`(() => {
    const raw = localStorage.getItem("finance-tracker-state-v1");
    if (!raw) throw new Error("No se encontró el estado financiero inicial");
    const state = JSON.parse(raw);
    (${edit.toString()})(state);
    localStorage.setItem("finance-tracker-state-v1", JSON.stringify(state));
  })()`)
  await mirrorStateToServer(page)
}

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
      await expect(settings.locator('tr[data-account-id]').first()).toBeVisible()

      await settings.getByRole('tab', { name: /Activos/ }).click()
      await expect(settings.locator('tr[data-asset-id]')).toHaveCount(9)
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
    ).toContainText('1234,50')
  })

  test('añade, reordena y elimina una categoría de gasto', async ({ tracker }) => {
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
    await expect(item).toHaveCount(0)
  })

  test('eliminar una cuenta pide confirmación y borra sus suscripciones pendientes', async ({
    tracker,
    page,
  }) => {
    const today = new Date().toISOString().slice(0, 10)
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

    await editState(page, (state) => {
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
    await tracker.reload()

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
    await expect(page.locator('#save-status')).toContainText('Sincronizado')

    await tracker.reload()
    await page.waitForFunction(() => {
      const raw = localStorage.getItem('finance-tracker-state-v1')
      return raw
        ? JSON.parse(raw).stockEvents?.symbolMappings?.some(
            (item: { symbol?: string; watchlistId?: string }) =>
              item.symbol === 'AGED' && item.watchlistId === 'wl-etf',
          )
        : false
    })
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
    await editState(page, (state) => {
      state.transactions.push({
        id: 'tx-orphan',
        type: 'investment',
        date: '2026-07-01',
        amount: 50,
        category: 'Sin activo',
        description: 'Compra suelta',
        accountId: 'revolut',
        symbol: 'ORPH',
      })
    })
    await tracker.reload()
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
