import { test, expect } from './fixtures'
import { expectSyncCommand } from './pages/sync'

test.describe('edición de una inversión desde Movimientos', () => {
  test.use({ fixedTime: '2026-09-12T12:00:00Z' })

  test('editing an investment from Movimientos preserves its data after sync and reload @smoke', async ({
    page,
    tracker,
  }) => {
    const created = expectSyncCommand(
      page,
      (command) => command.action === 'create' && command.entityType === 'transaction',
    )
    await tracker.addInvestmentMovement({
      date: '2026-09-12',
      time: '10:30',
      side: 'buy',
      symbol: 'VWCE',
      category: 'Acciones',
      unitPrice: 120.5,
      units: 10,
      fee: 1.2,
      movementCurrency: 'USD',
      brokerName: 'MyInvestor',
      declared: true,
    })
    await created

    const edited = expectSyncCommand(
      page,
      (command) => command.action === 'update' && command.entityType === 'transaction',
    )
    await tracker.editTransactionByDescription('Compra 10 VWCE', {
      newDescription: 'Compra revisada',
    })
    await edited
    await tracker.reload()
    await tracker.openInvestmentMovementsTab()
    await tracker
      .investmentMovementRow('VWCE')
      .getByRole('button', { name: /^Editar / })
      .click()
    const panel = tracker.investmentMovementPanel()
    const fields = tracker.investmentMovementFields(panel)
    await expect(fields.time).toHaveValue('10:30')
    await expect(fields.symbol).toHaveValue('VWCE')
    await expect(fields.units).toHaveValue('10')
    await expect(fields.unitPrice).toHaveValue('120.5')
    await expect(fields.fee).toHaveValue('1.2')
    await expect(fields.currency).toHaveValue('USD')
    await expect(panel.getByRole('switch', { name: 'Ya está declarado' })).toBeChecked()
  })
})

test.describe('mes contable de un movimiento', () => {
  test.use({ fixedTime: '2026-03-15T12:00:00Z' })

  test('a movement counted in another month than its date keeps it after sync and reload @smoke', async ({
    page,
    tracker,
  }) => {
    const created = expectSyncCommand(
      page,
      (command) => command.action === 'create' && command.entityType === 'transaction',
    )
    await tracker.addCustomTransaction({
      date: '2026-01-31',
      monthLabel: 'FEBRERO',
      type: 'expense',
      categoryLabel: 'Ocio',
      amount: 40,
      description: 'Cena fin de enero',
      accountLabel: 'Revolut',
    })
    await created

    await tracker.reload()
    await tracker.openTransactions()
    await tracker.revealOlderTransactions()
    // The ledger lists every month, so the row's own month is what must stay February (2).
    await expect(tracker.transactionRow('Cena fin de enero')).toHaveAttribute('data-tx-month', '2')
  })
})
