import { test, expect } from './fixtures'
import { LiveMarketPage } from './pages/LiveMarketPage'

/**
 * #493 — a rule accepted while the sync API is unreachable survives a reload
 * and creates exactly one rule with its occurrence.
 *
 * `page.route` aborts only the sync endpoints (the app shell still loads) so
 * the queue and the accepted intent are the only source of truth after the
 * reload, which is the window the module closes.
 */

const RULE = {
  account: 'Revolut',
  category: 'Fondos Indexados',
  description: 'Compra offline',
  amount: 300,
  frequency: 'monthly',
  startDate: '2026-11-01',
  symbol: 'VWCE',
  units: 1,
  unitPrice: 300,
}

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

test.describe('regla recurrente tras recargar (#493)', () => {
  test.use({ fixedTime: '2026-11-12T10:00:00Z' })

  test('conserva la regla y su vencimiento y los sincroniza al reconectar', async ({
    page,
    tracker,
  }) => {
    const liveMarket = new LiveMarketPage(page)
    await tracker.openInvestmentRecurringTab()

    await blockSyncApi(page)
    await liveMarket.createRecurringRule(RULE, { waitForSync: false })
    const rows = liveMarket.recurringRules.locator('tr[data-recurring-rule-id]')
    await expect(rows).toHaveCount(1)
    await expect(rows).toContainText(RULE.description)

    // Reload with the API still failing: the accepted rule, its occurrence
    // and the calendar come from the durable record, not from memory.
    await tracker.reload()
    await tracker.openInvestmentRecurringTab()
    await expect(rows).toHaveCount(1)
    await expect(rows).toContainText(RULE.description)
    await expect(page.locator('#sidebar-sync-status')).toContainText('pendiente')
    await expect(page.locator('#sidebar-sync-status')).not.toContainText('Sincronizado')

    await tracker.openTransactions()
    await expect(page.locator('[data-pending-panel] [data-pending-item]')).toHaveCount(1)
    await expect(
      page.locator('[data-pending-panel] [data-pending-item]').first(),
    ).toContainText(RULE.description)

    // Reconnect: the queued commands are sent once and the local work drains.
    await unblockSyncApi(page)
    await page.waitForResponse(
      (response) => response.url().includes('/api/sync') && response.request().method() === 'POST',
      { timeout: 20000 },
    )
    await expect(page.locator('#sidebar-sync-status')).toContainText('Sincronizado', {
      timeout: 20000,
    })

    await tracker.reload()
    await tracker.openInvestmentRecurringTab()
    await expect(rows).toHaveCount(1)
    await expect(rows).toContainText(RULE.description)
    await tracker.openTransactions()
    await expect(page.locator('[data-pending-panel] [data-pending-item]')).toHaveCount(1)
  })
})
