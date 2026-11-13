import { test, expect } from './fixtures'
import { LiveMarketPage } from './pages/LiveMarketPage'
import { blockSyncApi, expectSyncCommand } from './pages/sync'

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

test.describe('regla recurrente tras recargar (#493)', () => {
  test.use({ fixedTime: '2026-11-12T10:00:00Z' })

  test('conserva la regla y su vencimiento y los sincroniza al reconectar', async ({
    page,
    tracker,
  }) => {
    const liveMarket = new LiveMarketPage(page)
    await tracker.openInvestmentRecurringTab()

    const reconnect = await blockSyncApi(page)
    await liveMarket.createRecurringRule(RULE, { waitForSync: false })
    const rows = liveMarket.recurringRuleRows
    await expect(rows).toHaveCount(1)
    await expect(rows).toContainText(RULE.description)

    // Reload with the API still failing: the accepted rule, its occurrence
    // and the calendar come from the durable record, not from memory.
    await tracker.reload()
    await tracker.openInvestmentRecurringTab()
    await expect(rows).toHaveCount(1)
    await expect(rows).toContainText(RULE.description)
    await expect(tracker.syncStatus).toContainText('pendiente')
    await expect(tracker.syncStatus).not.toContainText('Sincronizado')

    await tracker.openTransactions()
    await expect(liveMarket.pendingItems()).toHaveCount(1)
    await expect(liveMarket.pendingItems().first()).toContainText(RULE.description)

    // Reconnect: the queued commands are sent once and the local work drains.
    // Both listeners exist before the route is lifted, so a fast response
    // cannot arrive first.
    const ruleSent = expectSyncCommand(
      page,
      (command) =>
        command.action === 'create' &&
        command.entityType === 'recurringRule' &&
        command.data.name === RULE.description,
    )
    const occurrenceSent = expectSyncCommand(
      page,
      (command) =>
        command.action === 'create' &&
        command.entityType === 'pendingMovement' &&
        command.data.description === RULE.description,
    )
    await reconnect()
    await ruleSent
    await occurrenceSent
    await expect(tracker.syncStatus).toContainText('Sincronizado')

    await tracker.reload()
    await tracker.openInvestmentRecurringTab()
    await expect(rows).toHaveCount(1)
    await expect(rows).toContainText(RULE.description)
    await tracker.openTransactions()
    await expect(liveMarket.pendingItems()).toHaveCount(1)
  })
})
