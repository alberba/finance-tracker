import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { FinanceTrackerPage } from './pages/FinanceTrackerPage'
import { syncV2TestHeaders } from './seed-sync-v2'

test('editing an investment from Movimientos preserves its data after sync and reload @smoke', async ({
  browser,
}) => {
  const email = `movement-command-${randomUUID()}@e2e.test`
  const context = await browser.newContext({ extraHTTPHeaders: { 'X-Test-User-Email': email } })
  try {
    const headers = await syncV2TestHeaders(context.request, email)
    const seed = await context.request.post('/api/sync', {
      headers,
      data: {
        commands: [
          {
            commandId: randomUUID(),
            action: 'create',
            entityType: 'account',
            data: {
              id: randomUUID(),
              name: 'MyInvestor',
              kind: 'cash',
              currency: 'EUR',
              openingBalance: 0,
            },
          },
          {
            commandId: randomUUID(),
            action: 'create',
            entityType: 'category',
            data: { id: randomUUID(), name: 'Acciones', kind: 'investment' },
          },
        ],
      },
    })
    expect(seed.ok()).toBe(true)
    expect((await seed.json()).results.map((result: { status: string }) => result.status)).toEqual([
      'applied',
      'applied',
    ])
    const page = await context.newPage()
    await page.clock.setFixedTime(new Date('2026-09-12T12:00:00Z'))
    const tracker = new FinanceTrackerPage(page)
    await tracker.goto()

    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/sync') &&
        response
          .request()
          .postDataJSON()
          ?.commands.some(
            (command: { action: string; entityType: string }) =>
              command.action === 'create' && command.entityType === 'transaction',
          ),
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
    expect((await (await created).json()).results[0].status).toBe('applied')

    const edited = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/sync') &&
        response
          .request()
          .postDataJSON()
          ?.commands.some(
            (command: { action: string; entityType: string }) =>
              command.action === 'update' && command.entityType === 'transaction',
          ),
    )
    await tracker.editTransactionByDescription('Compra 10 VWCE', {
      newDescription: 'Compra revisada',
    })
    expect((await (await edited).json()).results[0].status).toBe('applied')
    await tracker.reload()
    await tracker.openInvestmentMovementsTab()
    await tracker
      .investmentMovementRow('VWCE')
      .getByRole('button', { name: /^Editar / })
      .click()
    const panel = tracker.investmentMovementPanel()
    await expect(panel.locator('#investment-movement-time')).toHaveValue('10:30')
    await expect(panel.locator('#investment-movement-symbol')).toHaveValue('VWCE')
    await expect(panel.locator('#investment-movement-units')).toHaveValue('10')
    await expect(panel.locator('#investment-movement-unit-price')).toHaveValue('120.5')
    await expect(panel.locator('#investment-movement-fee')).toHaveValue('1.2')
    await expect(panel.locator('#investment-movement-currency')).toHaveValue('USD')
    await expect(panel.getByRole('switch', { name: 'Ya está declarado' })).toBeChecked()
  } finally {
    await context.close()
  }
})

test('a movement counted in another month than its date keeps it after sync and reload @smoke', async ({
  browser,
}) => {
  const email = `accounting-month-${randomUUID()}@e2e.test`
  const context = await browser.newContext({ extraHTTPHeaders: { 'X-Test-User-Email': email } })
  try {
    const headers = await syncV2TestHeaders(context.request, email)
    const seed = await context.request.post('/api/sync', {
      headers,
      data: {
        commands: [
          {
            commandId: randomUUID(),
            action: 'create',
            entityType: 'account',
            data: {
              id: randomUUID(),
              name: 'Cuenta',
              kind: 'cash',
              currency: 'EUR',
              openingBalance: 0,
            },
          },
          {
            commandId: randomUUID(),
            action: 'create',
            entityType: 'category',
            data: { id: randomUUID(), name: 'Ocio', kind: 'expense' },
          },
        ],
      },
    })
    expect(seed.ok()).toBe(true)
    const page = await context.newPage()
    await page.clock.setFixedTime(new Date('2026-03-15T12:00:00Z'))
    const tracker = new FinanceTrackerPage(page)
    await tracker.goto()

    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/sync') &&
        response
          .request()
          .postDataJSON()
          ?.commands.some(
            (command: { action: string; entityType: string }) =>
              command.action === 'create' && command.entityType === 'transaction',
          ),
    )
    await tracker.addCustomTransaction({
      date: '2026-01-31',
      monthLabel: 'FEBRERO',
      type: 'expense',
      categoryLabel: 'Ocio',
      amount: 40,
      description: 'Cena fin de enero',
      accountLabel: 'Cuenta',
    })
    expect((await (await created).json()).results[0].status).toBe('applied')

    await tracker.reload()
    // The ledger lists every month, so the row's own month is what must stay February (2).
    await expect(tracker.transactionRow('Cena fin de enero')).toHaveAttribute('data-tx-month', '2')
  } finally {
    await context.close()
  }
})
