import { test, expect, mirrorStateToServer } from './fixtures'

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function shortDate(isoDate: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`))
}

test.describe('suscripciones de gastos', () => {
  test('presenta las suscripciones y su panel con controles accesibles en móvil', { tag: '@smoke' }, async ({
    page,
    tracker,
  }) => {
    await tracker.openSubscriptionsTab()

    const subscriptions = tracker.transactionsSection.locator('#transactions-tab-subscriptions')
    await expect(
      subscriptions.getByLabel('Resumen de suscripciones').getByText('Comprometido al mes'),
    ).toBeVisible()
    await expect(subscriptions.getByRole('heading', { name: 'Tus suscripciones' })).toBeVisible()
    await expect(subscriptions.getByText('Aún no hay suscripciones')).toBeVisible()
    await expect(subscriptions.getByRole('heading', { name: 'Dónde se va' })).toBeVisible()
    await expect(subscriptions.getByRole('heading', { name: 'Próximos 30 días' })).toBeVisible()

    await tracker.openNewSubscriptionPanel()
    const panel = page.getByRole('dialog', { name: 'Nueva suscripción' })
    await expect(panel.getByLabel('Nombre')).toHaveAttribute('required', '')
    await expect(panel.getByLabel('Categoría')).toHaveValue('Suscripciones')
    await expect(panel.getByRole('button', { name: 'Añadir suscripción' })).toBeVisible()

    await page.setViewportSize({ width: 375, height: 812 })

    const mobileControls = [
      panel.getByLabel('Nombre'),
      panel.getByLabel('Importe'),
      panel.getByLabel('Cuenta'),
      panel.getByRole('button', { name: 'Mensual' }),
      panel.getByRole('button', { name: 'Añadir suscripción' }),
    ]
    for (const control of mobileControls) {
      await control.scrollIntoViewIfNeeded()
      await expect(control).toBeInViewport()
      expect(
        await control.evaluate((element) => element.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(42)
    }
  })

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
    const subscriptions = tracker.transactionsSection.locator('#transactions-tab-subscriptions')
    const summary = subscriptions.getByLabel('Resumen de suscripciones')
    await expect(summary).toContainText('14,99 €')
    await expect(summary).toContainText('179,88 €')
    await expect(subscriptions.locator('[data-subscriptions-total]')).toHaveText('14,99 € / mes')

    await tracker.openTransactions()
    await tracker.transactionsSection.getByRole('tab', { name: /Registro/ }).click()
    await tracker.revealOlderTransactions()
    await expect(tracker.transactionRows.filter({ hasText: 'E2E Streaming' })).toHaveCount(1)

    await tracker.reload()
    await tracker.openTransactions()
    await tracker.revealOlderTransactions()
    await expect(tracker.transactionRows.filter({ hasText: 'E2E Streaming' })).toHaveCount(1)
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

    const subscriptions = tracker.transactionsSection.locator('#transactions-tab-subscriptions')
    const row = subscriptions.locator('tr[data-subscription-id]', { hasText: 'E2E Pausable' })
    const toggle = row.getByRole('switch', { name: 'E2E Pausable activa' })
    await expect(toggle).toBeChecked()
    await row.locator('label:has([role="switch"])').click()
    await expect(toggle).not.toBeChecked()
    await expect(row).toContainText('Pausada')
    await row.getByRole('button', { name: 'Eliminar la suscripción E2E Pausable' }).click()
    await expect(page.getByRole('status')).toContainText('gastos ya creados se conservan')
    await expect(row).toHaveCount(0)

    await tracker.transactionsSection.getByRole('tab', { name: /Registro/ }).click()
    await tracker.revealOlderTransactions()
    await expect(tracker.transactionRows.filter({ hasText: 'E2E Pausable' })).toHaveCount(1)
  })

  test('resume el compromiso, dónde se va y los próximos cobros sin scroll lateral', async ({
    page,
    tracker,
  }) => {
    await page.evaluate(() => {
      const raw = localStorage.getItem('finance-tracker-state-v1')
      if (!raw) throw new Error('No se encontró el estado local')
      const state = JSON.parse(raw)
      state.subscriptions = [
        {
          id: 'analysis-monthly',
          name: 'Streaming análisis',
          amount: 10,
          accountId: 'revolut',
          category: 'Ocio',
          frequency: 'monthly',
          startDate: '2026-01-01',
          nextChargeDate: '2026-08-20',
          active: true,
        },
        {
          id: 'analysis-yearly',
          name: 'Nube análisis',
          amount: 120,
          accountId: 'santander',
          category: 'Software',
          frequency: 'yearly',
          startDate: '2026-01-01',
          nextChargeDate: '2026-10-01',
          active: true,
        },
        {
          id: 'analysis-paused',
          name: 'Gimnasio pausado',
          amount: 30,
          accountId: 'revolut',
          category: 'Salud',
          frequency: 'quarterly',
          startDate: '2026-01-01',
          nextChargeDate: '2026-09-01',
          active: false,
        },
      ]
      localStorage.setItem('finance-tracker-state-v1', JSON.stringify(state))
    })
    await mirrorStateToServer(page)
    await tracker.reload()
    await tracker.openTransactions()
    await tracker.openSubscriptionsTab()

    const subscriptions = tracker.transactionsSection.locator('#transactions-tab-subscriptions')
    const summary = subscriptions.getByLabel('Resumen de suscripciones')
    await expect(summary).toContainText('20,00 €')
    await expect(summary).toContainText('240,00 €')
    await expect(summary).toContainText('de 3')

    const where = subscriptions.getByRole('region', { name: 'Dónde se va' })
    await expect(where).toContainText('Ocio')
    await expect(where).toContainText('Software')
    await expect(where).not.toContainText('Salud')
    await expect(
      subscriptions.locator('tr[data-subscription-id]', { hasText: 'Gimnasio pausado' }),
    ).toContainText('En pausa')

    await page.setViewportSize({ width: 375, height: 812 })
    await expect(subscriptions).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  })

  test('al reactivar una suscripción descarta el periodo pausado', async ({ page, tracker }) => {
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

    await page.evaluate(
      ({ pausedDate }) => {
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
      },
      { pausedDate },
    )
    await mirrorStateToServer(page)

    await tracker.reload()
    await tracker.openSubscriptionsTab()
    const subscriptions = tracker.transactionsSection.locator('#transactions-tab-subscriptions')
    const row = subscriptions.locator('tr[data-subscription-id]', { hasText: 'E2E Reactivada' })
    const toggle = row.getByRole('switch', { name: 'E2E Reactivada activa' })
    await row.locator('label:has([role="switch"])').click()
    await expect(toggle).toBeChecked()

    await expect(row).toContainText(shortDate(nextChargeDate))

    await tracker.reload()
    await tracker.openTransactions()
    await tracker.revealOlderTransactions()
    await expect(tracker.transactionRows.filter({ hasText: 'E2E Reactivada' })).toHaveCount(0)
  })
})
