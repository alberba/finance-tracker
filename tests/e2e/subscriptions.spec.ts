import { test, expect } from './fixtures'
import { setSwitch } from './pages/controls'
import type { Page } from '@playwright/test'
import type { FinanceTrackerPage } from './pages/FinanceTrackerPage'

type BackupRow = Record<string, unknown>

async function replaceBackup(
  page: Page,
  tracker: FinanceTrackerPage,
  collections: Record<string, unknown[]>,
) {
  const exported = await page.request.get('/api/data/export')
  expect(exported.ok()).toBe(true)
  const backup = (await exported.json()) as BackupRow
  for (const [key, value] of Object.entries(backup)) {
    if (Array.isArray(value)) backup[key] = []
  }
  Object.assign(backup, collections)

  const imported = await page.request.post('/api/data/import?mode=replace', { data: backup })
  expect(imported.ok()).toBe(true)
  const result = (await imported.json()) as { skipped?: Record<string, number> }
  expect(result.skipped ?? {}).toEqual({})
  await tracker.reload()
}

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

// The app's today, pinned before the first render so every date below is a fixed literal.
const FIXED_TIME = '2026-11-12T12:00:00Z'
const TODAY = '2026-11-12'

test.use({ fixedTime: FIXED_TIME })

test.describe('suscripciones de gastos', () => {
  test(
    'presenta las suscripciones y su panel con controles accesibles en móvil',
    { tag: '@smoke' },
    async ({ page, tracker }) => {
      await tracker.openSubscriptionsTab()

      const subscriptions = tracker.subscriptionsTab
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
    },
  )

  test('crea un gasto en su primer cobro, se conserva al recargar y no se duplica', async ({
    page,
    tracker,
  }) => {
    const today = TODAY
    await tracker.addSubscription({
      name: 'E2E Streaming',
      amount: 14.99,
      categoryLabel: 'Comida',
      frequency: 'monthly',
      firstChargeDate: today,
    })

    await expect(page.getByRole('status')).toContainText('gasto generado')
    const subscriptions = tracker.subscriptionsTab
    const summary = subscriptions.getByLabel('Resumen de suscripciones')
    await expect(summary).toContainText('14,99 €')
    await expect(summary).toContainText('179,88 €')
    await expect(tracker.subscriptionsTotal).toHaveText('14,99 € / mes')

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
    const today = TODAY
    await tracker.addSubscription({
      name: 'E2E Pausable',
      amount: 8,
      categoryLabel: 'Comida',
      frequency: 'weekly',
      firstChargeDate: today,
    })

    const row = tracker.subscriptionRow('E2E Pausable')
    const toggle = row.getByRole('switch', { name: 'E2E Pausable activa' })
    await expect(toggle).toBeChecked()
    await setSwitch(toggle, false)
    await expect(row).toContainText('Pausada')
    await row.getByRole('button', { name: 'Eliminar la suscripción E2E Pausable' }).click()
    const dialog = page.getByRole('alertdialog', { name: '¿Eliminar esta suscripción?' })
    await expect(dialog).toContainText('E2E Pausable')
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialog).toBeHidden()
    await expect(row).toHaveCount(1)
    await row.getByRole('button', { name: 'Eliminar la suscripción E2E Pausable' }).click()
    await dialog.getByRole('button', { name: 'Eliminar suscripción' }).click()
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
    await replaceBackup(page, tracker, {
      accounts: [
        { id: 'revolut', name: 'Revolut', kind: 'cash', currency: 'EUR', openingBalance: 0 },
        { id: 'santander', name: 'Santander', kind: 'cash', currency: 'EUR', openingBalance: 0 },
      ],
      categories: [
        { id: 'ocio', name: 'Ocio', kind: 'expense' },
        { id: 'software', name: 'Software', kind: 'expense' },
        { id: 'salud', name: 'Salud', kind: 'expense' },
      ],
      subscriptions: [
        {
          id: 'analysis-monthly',
          name: 'Streaming análisis',
          amount: 10,
          accountId: 'revolut',
          categoryId: 'ocio',
          frequency: 'monthly',
          startDate: '2026-01-01',
          nextChargeDate: '2026-08-20',
          isActive: true,
        },
        {
          id: 'analysis-yearly',
          name: 'Nube análisis',
          amount: 120,
          accountId: 'santander',
          categoryId: 'software',
          frequency: 'yearly',
          startDate: '2026-01-01',
          nextChargeDate: '2026-10-01',
          isActive: true,
        },
        {
          id: 'analysis-paused',
          name: 'Gimnasio pausado',
          amount: 30,
          accountId: 'revolut',
          categoryId: 'salud',
          frequency: 'quarterly',
          startDate: '2026-01-01',
          nextChargeDate: '2026-09-01',
          isActive: false,
        },
      ],
    })
    await tracker.openTransactions()
    await tracker.openSubscriptionsTab()

    const subscriptions = tracker.subscriptionsTab
    const summary = subscriptions.getByLabel('Resumen de suscripciones')
    await expect(summary).toContainText('20,00 €')
    await expect(summary).toContainText('240,00 €')
    await expect(summary).toContainText('de 3')

    const where = subscriptions.getByRole('region', { name: 'Dónde se va' })
    await expect(where).toContainText('Ocio')
    await expect(where).toContainText('Software')
    await expect(where).not.toContainText('Salud')
    await expect(tracker.subscriptionRow('Gimnasio pausado')).toContainText('En pausa')

    await page.setViewportSize({ width: 375, height: 812 })
    await expect(subscriptions).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  })

  test('al reactivar una suscripción descarta el periodo pausado', async ({ page, tracker }) => {
    const today = TODAY
    const pausedDate = addDays(today, -10)
    const nextChargeDate = addDays(pausedDate, 14)

    await replaceBackup(page, tracker, {
      accounts: [
        { id: 'revolut', name: 'Revolut', kind: 'cash', currency: 'EUR', openingBalance: 0 },
      ],
      categories: [{ id: 'comida', name: 'Comida', kind: 'expense' }],
      subscriptions: [
        {
          id: 'reactivated',
          name: 'E2E Reactivada',
          amount: 8,
          accountId: 'revolut',
          categoryId: 'comida',
          frequency: 'weekly',
          startDate: today,
          nextChargeDate: pausedDate,
          isActive: false,
        },
      ],
      transactions: [],
    })
    await tracker.openSubscriptionsTab()
    const row = tracker.subscriptionRow('E2E Reactivada')
    const toggle = row.getByRole('switch', { name: 'E2E Reactivada activa' })
    await setSwitch(toggle, true)

    await expect(row).toContainText(shortDate(nextChargeDate))

    await tracker.reload()
    await tracker.openTransactions()
    await tracker.revealOlderTransactions()
    await expect(tracker.transactionRows.filter({ hasText: 'E2E Reactivada' })).toHaveCount(0)
  })
})
