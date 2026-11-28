import { editScenarioState } from './seed-sync-v2'
import { test, expect } from './fixtures'
import { blockSyncApi, expectSyncCommand } from './pages/sync'

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

test.describe('confirmación recurrente tras recargar (#492)', () => {
  // «Por confirmar» sits in the mobile frame's app bar (the Dashboard card on desktop).
  test.use({ fixedTime: '2026-11-12T10:00:00Z', viewport: { width: 393, height: 780 } })

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
    await expect(tracker.pendingTrigger).toHaveAccessibleName('Por confirmar, 1 pendiente')

    // The sync API is unreachable from now on (`/api/session` stays reachable
    // so the shell can hydrate and reload); navigation still works.
    const reconnect = await blockSyncApi(page)

    await tracker.openPendingEdit('Alquiler E2E')
    const sheet = tracker.pendingEditSheet
    await sheet.getByLabel('Descripción').fill('Alquiler E2E editado')
    await sheet.getByRole('textbox', { name: 'Importe' }).fill('925')
    await sheet.getByRole('button', { name: 'Guardar y confirmar' }).click()
    await expect(sheet).toBeHidden()

    // The optimistic confirmation is shown, backed by the durable reservation:
    // the pending is no longer open and the status does not claim the server
    // confirmed it.
    await expect(tracker.pendingTrigger).toHaveAccessibleName('Por confirmar')
    await expect(tracker.syncStatus).toContainText('pendiente')
    await expect(tracker.syncStatus).not.toContainText('Sincronizado')

    // Reload with the API still failing: the accepted edit and the movement id
    // must be recovered from the queue, without a second movement.
    await tracker.reload()
    await tracker.openTransactions()
    const rows = tracker.transactionRows.filter({ hasText: 'Alquiler E2E editado' })
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('925,00')
    await expect(tracker.pendingTrigger).toHaveAccessibleName('Por confirmar')

    // Reconnect: the movement is resent with the same command; the pending link
    // is completed after the movement is acknowledged. The listener exists
    // before the route is lifted, so a fast response cannot arrive first.
    const movementSent = expectSyncCommand(
      page,
      (command) =>
        command.action === 'create' &&
        command.entityType === 'transaction' &&
        command.data.description === 'Alquiler E2E editado',
    )
    await reconnect()
    await movementSent
    await expect(tracker.syncStatus).toContainText('Sincronizado')

    await tracker.reload()
    await tracker.openTransactions()
    await expect(tracker.transactionRows.filter({ hasText: 'Alquiler E2E editado' })).toHaveCount(1)
    await expect(tracker.pendingTrigger).toHaveAccessibleName('Por confirmar')
  })
})
