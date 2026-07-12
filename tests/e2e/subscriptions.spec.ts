import { test, expect } from './fixtures'

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

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

  test('al reactivar una suscripción descarta el periodo pausado', async ({
    page,
    tracker,
  }) => {
    const today = new Date().toISOString().slice(0, 10)
    const pausedDate = addDays(today, -10)
    const nextChargeDate = addDays(pausedDate, 14)

    await tracker.addSubscription({
      name: 'E2E Reactivada',
      amount: 8,
      categoryLabel: 'Comida',
      frequency: 'weekly',
      firstChargeDate: today,
    })

    await page.evaluate(({ pausedDate }) => {
      const rawState = localStorage.getItem('finance-tracker-state-v1')
      if (!rawState) {
        throw new Error('No se encontró el estado local')
      }
      const state = JSON.parse(rawState) as {
        meta: { savedAt: string | null }
        subscriptions: Array<{
          id: string
          name: string
          active: boolean
          nextChargeDate: string
        }>
        transactions: Array<{ subscriptionId?: string }>
      }
      const subscription = state.subscriptions.find((item) => item.name === 'E2E Reactivada')
      if (!subscription) {
        throw new Error('No se encontró la suscripción de prueba')
      }
      subscription.active = false
      subscription.nextChargeDate = pausedDate
      state.transactions = state.transactions.filter(
        (transaction) => transaction.subscriptionId !== subscription.id,
      )
      state.meta.savedAt = new Date(Date.now() + 60_000).toISOString()
      localStorage.setItem('finance-tracker-state-v1', JSON.stringify(state))
    }, { pausedDate })

    await tracker.reload()
    await tracker.openSubscriptionsTab()
    const subscriptions = tracker.transactionsSection.locator(
      '#transactions-tab-subscriptions',
    )
    const row = subscriptions.getByRole('listitem').filter({ hasText: 'E2E Reactivada' })
    await row.getByRole('button', { name: 'Reactivar' }).click()

    await expect(row).toContainText(`Próximo cobro: ${nextChargeDate}`)

    await tracker.reload()
    await tracker.openTransactions()
    await expect(
      tracker.transactionsSection.locator('#tx-table-body tr', { hasText: 'E2E Reactivada' }),
    ).toHaveCount(0)
  })
})
