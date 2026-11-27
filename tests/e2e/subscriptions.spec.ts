import { test, expect } from './fixtures'
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

/** «24 nov», as the detail panel writes the next charge. */
function dayMonth(isoDate: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`))
}

function todayLocal(): string {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}-${month}-${day}`
}

const list = (page: Page) => page.locator('#transactions [data-subscription-list]')
const row = (page: Page, name: string) =>
  list(page).locator('[data-subscription-id]').filter({ hasText: name })
const summary = (page: Page) =>
  page.locator('#transactions').getByRole('complementary', { name: 'Resumen de suscripciones' })

async function registryRows(tracker: FinanceTrackerPage, name: string) {
  await tracker.transactionsSection.getByRole('tab', { name: /^Registro/ }).click()
  await tracker.revealOlderTransactions()
  return tracker.transactionRows.filter({ hasText: name })
}

test.describe('suscripciones de gastos', () => {
  test(
    'presenta las suscripciones vacías y abre el alta con sus campos',
    { tag: '@smoke' },
    async ({ tracker }) => {
      await tracker.openSubscriptionsTab()
      await expect(
        tracker.transactionsSection.getByText('Aún no tienes suscripciones.'),
      ).toBeVisible()

      await tracker.openNewSubscriptionPanel()
      const panel = tracker.subscriptionPanel('Nueva suscripción')
      await expect(panel.getByLabel('Nombre')).toHaveValue('')
      await expect(panel.getByLabel('Frecuencia')).toHaveValue('monthly')
      await expect(panel.getByLabel('Primer cobro')).toHaveValue(todayLocal())
      await panel.getByRole('button', { name: 'Descartar' }).click()
      await expect(panel).toBeHidden()
    },
  )

  test('crea un gasto en su primer cobro, se conserva al recargar y no se duplica', async ({
    page,
    tracker,
  }) => {
    await tracker.addSubscription({
      name: 'E2E Streaming',
      amount: 14.99,
      categoryLabel: 'Comida',
      frequency: 'monthly',
      firstChargeDate: todayLocal(),
    })

    await expect(page.locator('#toast')).toContainText('1 gasto generado')
    await expect(summary(page).locator('[data-subscriptions-monthly]')).toContainText('14,99 €')
    await expect(summary(page)).toContainText('179,88 € al año · 1 activa')

    await expect(await registryRows(tracker, 'E2E Streaming')).toHaveCount(1)
    await tracker.reload()
    await tracker.openTransactions()
    await expect(await registryRows(tracker, 'E2E Streaming')).toHaveCount(1)
  })

  test('permite pausar y eliminar una suscripción sin borrar su gasto', async ({
    page,
    tracker,
  }) => {
    await tracker.addSubscription({
      name: 'E2E Pausable',
      amount: 8,
      categoryLabel: 'Comida',
      frequency: 'weekly',
      firstChargeDate: todayLocal(),
    })

    await row(page, 'E2E Pausable').click()
    const panel = tracker.subscriptionPanel('E2E Pausable')
    await expect(panel).toContainText('Activa: genera un gasto en cada cobro.')
    await panel.getByRole('button', { name: 'Pausar' }).click()
    await expect(page.locator('#toast')).toContainText('Suscripción pausada.')
    await expect(panel).toContainText('En pausa: no genera gastos.')

    await panel.getByRole('button', { name: 'Eliminar', exact: true }).click()
    await expect(panel.getByRole('alert')).toContainText('¿Eliminar E2E Pausable?')
    await panel.getByRole('button', { name: 'Cancelar' }).click()
    await expect(panel.getByRole('alert')).toBeHidden()
    await panel.getByRole('button', { name: 'Eliminar', exact: true }).click()
    await panel.getByRole('button', { name: 'Eliminar suscripción' }).click()
    await expect(page.locator('#toast')).toContainText('gastos ya creados se conservan')
    await expect(panel).toBeHidden()
    await expect(row(page, 'E2E Pausable')).toHaveCount(0)

    await expect(await registryRows(tracker, 'E2E Pausable')).toHaveCount(1)
  })

  test('resume el compromiso y lo que dejan de cobrar las pausadas', async ({ page, tracker }) => {
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
    await tracker.openSubscriptionsTab()

    await expect(summary(page).locator('[data-subscriptions-monthly]')).toContainText('20,00 €')
    await expect(summary(page)).toContainText('240,00 € al año · 2 activas')
    await expect(list(page)).toContainText('Dejas de pagar 120,00 € al año')
    await row(page, 'Gimnasio pausado').click()
    await expect(tracker.subscriptionPanel('Gimnasio pausado')).toContainText(
      'En pausa: no genera gastos.',
    )
  })

  test('al reactivar una suscripción descarta el periodo pausado', async ({ page, tracker }) => {
    const today = todayLocal()
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
    await row(page, 'E2E Reactivada').click()
    const panel = tracker.subscriptionPanel('E2E Reactivada')
    await panel.getByRole('button', { name: 'Reactivar' }).click()
    await expect(page.locator('#toast')).toContainText('Suscripción reactivada.')
    await expect(panel).toContainText(`Próximo cobro${dayMonth(nextChargeDate)}`)

    await tracker.reload()
    await tracker.openTransactions()
    await tracker.revealOlderTransactions()
    await expect(tracker.transactionRows.filter({ hasText: 'E2E Reactivada' })).toHaveCount(0)
  })
})
