import { editScenarioState } from './seed-sync-v2'
import { test, expect } from './fixtures'

/**
 * #492 — an edited recurring confirmation survives a reload and creates exactly
 * one movement.
 *
 * The queue is forced to fail its API requests with `page.route` instead of
 * `context.setOffline`, because an offline context cannot reload (there is no
 * service worker): the app shell loads and the local queue/reservation are the
 * only source of truth, which is exactly the window this ticket closes.
 */

const DUE_DATE = '2026-11-05'
const STAMP = '2026-11-01T00:00:00.000Z'

/**
 * Cuts only the sync endpoints. `/api/session` stays reachable so the shell can
 * hydrate and reload; that is the real "queued locally, no server" window.
 */
async function blockSyncApi(page: import('@playwright/test').Page): Promise<void> {
  const block = (route: import('@playwright/test').Route) => route.abort()
  await page.route('**/api/sync', block)
  await page.route('**/api/bootstrap', block)
  await page.route('**/api/changes*', block)
}

async function unblockSyncApi(page: import('@playwright/test').Page): Promise<void> {
  await page.unroute('**/api/sync')
  await page.unroute('**/api/bootstrap')
  await page.unroute('**/api/changes*')
}

test.describe('confirmación recurrente tras recargar (#492)', () => {
  test.use({ fixedTime: '2026-11-12T10:00:00Z' })

  test('recupera la confirmación editada y crea un solo movimiento', async ({ page, tracker }) => {
    await editScenarioState(page, (state) => {
      const account = state.accounts[0]
      const category = state.expenseCategories[0]
      state.recurringRules.push({
        id: 'e2e-confirm-rule',
        type: 'expense',
        accountId: account.id,
        category,
        description: 'Alquiler E2E',
        amount: 900,
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-10-05',
        endDate: null,
        active: true,
        lastExecutionDate: '2026-10-05',
        nextOccurrenceDate: DUE_DATE,
      })
      state.pendingMovements.push({
        id: 'e2e-confirm-pending',
        occurrenceKey: 'e2e-confirm-rule:2026-11-05',
        ruleId: 'e2e-confirm-rule',
        occurrenceDate: DUE_DATE,
        type: 'expense',
        accountId: account.id,
        category,
        description: 'Alquiler E2E',
        amount: 900,
        status: 'pending',
        createdAt: STAMP,
        updatedAt: STAMP,
        transactionId: null,
      })
    })

    await tracker.openTransactions()
    const pendingPanel = page.locator('[data-pending-panel]')
    const pendingItem = pendingPanel.locator('[data-pending-item="e2e-confirm-pending"]')
    await expect(pendingItem).toBeVisible()

    // The sync API is unreachable from now on; navigation still works.
    await blockSyncApi(page)

    await pendingItem.getByRole('button', { name: 'Editar y confirmar Alquiler E2E' }).click()
    const panel = page.locator('#pending-edit-panel')
    await expect(panel).toBeVisible()
    await panel.getByLabel('Descripción').fill('Alquiler E2E editado')
    await panel.getByLabel('Importe', { exact: true }).fill('925')
    await panel.getByRole('button', { name: 'Guardar y confirmar' }).click()
    await expect(panel).toBeHidden()

    // The optimistic confirmation is shown, backed by the durable reservation:
    // the pending is no longer open and the status does not claim the server
    // confirmed it.
    await expect(pendingItem).toHaveCount(0)
    const status = page.locator('#sidebar-sync-status')
    await expect(status).toContainText('pendiente')
    await expect(status).not.toContainText('Sincronizado')

    // Reload with the API still failing: the accepted edit and the movement id
    // must be recovered from the queue, without a second movement.
    await tracker.reload()
    await tracker.openTransactions()
    await tracker.filterTransactionsMonth('NOVIEMBRE')
    const rows = tracker.transactionRows.filter({ hasText: 'Alquiler E2E editado' })
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('925,00')
    await expect(page.locator('[data-pending-panel]')).toHaveCount(0)

    // Reconnect: the movement is resent with the same command; the pending link
    // is completed after the movement is acknowledged.
    await unblockSyncApi(page)
    await page.waitForResponse(
      (response) => response.url().includes('/api/sync') && response.request().method() === 'POST',
      { timeout: 20000 },
    )
    await expect(page.locator('#sidebar-sync-status')).toContainText('Sincronizado', {
      timeout: 20000,
    })

    await tracker.reload()
    await tracker.openTransactions()
    await tracker.filterTransactionsMonth('NOVIEMBRE')
    await expect(tracker.transactionRows.filter({ hasText: 'Alquiler E2E editado' })).toHaveCount(1)
    await expect(page.locator('[data-pending-panel]')).toHaveCount(0)
  })
})
