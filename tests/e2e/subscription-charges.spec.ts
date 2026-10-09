import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { FinanceTrackerPage } from './pages/FinanceTrackerPage'

test('sync v2 guarda el cobro vencido al arrancar y no lo duplica al recargar', async ({
  page,
}) => {
  await page.context().setExtraHTTPHeaders({
    'X-Test-User-Email': `pw-subscription-${randomUUID()}@e2e.test`,
  })
  const initialization = await page.request.post('/api/state/initialize', { data: {} })
  expect(initialization.ok()).toBe(true)
  const accountId = randomUUID()
  const seeded = await page.request.post('/api/sync', {
    data: {
      commands: [
        {
          commandId: randomUUID(),
          action: 'create',
          entityType: 'account',
          data: {
            id: accountId,
            name: 'Cuenta Todoist',
            kind: 'cash',
            currency: 'EUR',
            openingBalance: 0,
          },
        },
        {
          commandId: randomUUID(),
          action: 'create',
          entityType: 'subscription',
          data: {
            id: randomUUID(),
            name: 'Todoist',
            accountId,
            amount: 48,
            currency: 'EUR',
            startDate: '2025-09-12',
            nextChargeDate: '2026-09-12',
            frequency: 'yearly',
            isActive: true,
          },
        },
      ],
    },
  })
  expect(seeded.ok()).toBe(true)
  expect((await seeded.json()).results.map((result: { status: string }) => result.status)).toEqual([
    'applied',
    'applied',
  ])
  await page.clock.setFixedTime(new Date('2026-09-13T10:00:00Z'))
  const tracker = new FinanceTrackerPage(page)
  await tracker.goto()
  await tracker.openTransactions()
  const charges = tracker.transactionRows.filter({ hasText: 'Todoist' })
  await expect(charges).toHaveCount(1)
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/bootstrap')
      return (await response.json()).transactions.filter(
        (tx: { description: string }) => tx.description === 'Todoist',
      ).length
    })
    .toBe(1)
  await tracker.reload()
  await tracker.openTransactions()
  await expect(charges).toHaveCount(1)
})
