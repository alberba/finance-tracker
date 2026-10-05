import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { FinanceTrackerPage } from './pages/FinanceTrackerPage'

test('editing an investment from Movimientos preserves its data after sync and reload @smoke', async ({
  browser,
}) => {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'X-Test-User-Email': `movement-command-${randomUUID()}@e2e.test` },
  })
  try {
    const seed = await context.request.post('/api/sync', {
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
    await expect(panel.locator('#investment-movement-declared')).toBeChecked()
  } finally {
    await context.close()
  }
})
