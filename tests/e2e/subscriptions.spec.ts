import { test, expect } from './fixtures'

test.describe('suscripciones de gastos', () => {
  test('crea un gasto en su primer cobro, se conserva al recargar y no se duplica', async ({
    page,
    tracker,
  }) => {
    const today = new Date().toISOString().slice(0, 10)
    await tracker.addSubscription({
      name: 'E2E Streaming',
      amount: 14.99,
      categoryLabel: 'Comida',
      frequency: 'monthly',
      firstChargeDate: today,
    })

    await expect(page.getByRole('status')).toContainText('gasto generado')
    await tracker.openTransactions()
    await expect(
      tracker.transactionsSection.locator('#tx-table-body tr', { hasText: 'E2E Streaming' }),
    ).toHaveCount(1)

    await tracker.reload()
    await tracker.openTransactions()
    await expect(
      tracker.transactionsSection.locator('#tx-table-body tr', { hasText: 'E2E Streaming' }),
    ).toHaveCount(1)
  })

  test('permite pausar y eliminar una suscripción sin borrar su gasto', async ({
    page,
    tracker,
  }) => {
    const today = new Date().toISOString().slice(0, 10)
    await tracker.addSubscription({
      name: 'E2E Pausable',
      amount: 8,
      categoryLabel: 'Comida',
      frequency: 'weekly',
      firstChargeDate: today,
    })

    const subscriptions = tracker.transactionsSection.locator(
      '#transactions-tab-subscriptions',
    )
    const row = subscriptions.getByRole('listitem').filter({ hasText: 'E2E Pausable' })
    await row.getByRole('button', { name: 'Pausar' }).click()
    await expect(row).toContainText('Pausada')
    await row.getByRole('button', { name: 'Eliminar' }).click()
    await expect(page.getByRole('status')).toContainText('gastos ya creados se conservan')

    await tracker.openTransactions()
    await expect(
      tracker.transactionsSection.locator('#tx-table-body tr', { hasText: 'E2E Pausable' }),
    ).toHaveCount(1)
  })
})
