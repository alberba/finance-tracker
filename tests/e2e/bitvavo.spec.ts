import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import fixture from '../unit/fixtures/bitvavo-real-sanitized.json' with { type: 'json' }
import { BitvavoPage } from './pages/BitvavoPage'

// Real D1 and server routes, with only the external Bitvavo HTTP boundary replaced.
test('imports a closed preview, retains exact data after reload and synchronizes another client @smoke', async ({
  browser,
}) => {
  const email = `bitvavo-${randomUUID()}@e2e.test`
  const headers = {
    'X-Test-User-Email': email,
    'X-Test-Bitvavo-History': JSON.stringify(fixture.transactions),
  }
  const context = await browser.newContext({ extraHTTPHeaders: headers })
  const accountId = randomUUID()
  try {
    const seeded = await context.request.post('/api/sync', {
      data: {
        commands: [
          {
            commandId: randomUUID(),
            action: 'create',
            entityType: 'account',
            data: {
              id: accountId,
              name: 'Bitvavo EUR',
              kind: 'cash',
              currency: 'EUR',
              openingBalance: 0,
            },
          },
        ],
      },
    })
    expect(seeded.ok()).toBe(true)
    const page = await context.newPage()
    const bitvavo = new BitvavoPage(page)
    await bitvavo.tracker.goto()
    await bitvavo.open()
    await bitvavo.connect(accountId)
    await bitvavo.preview()
    await expect(bitvavo.panel.getByText('0.01789334395', { exact: true })).toBeVisible()
    await bitvavo.confirm()
    await bitvavo.close()
    await page.getByLabel('Año', { exact: true }).selectOption('2020')
    const rows = page.locator('[data-investment-tx-id]')
    await expect(rows).toHaveCount(2)
    await expect(rows.getByRole('button', { name: /^Editar/ })).toHaveCount(0)
    await expect(rows.getByRole('button', { name: /^Eliminar/ })).toHaveCount(0)
    await bitvavo.tracker.reload()
    await bitvavo.open()
    await bitvavo.preview()
    await bitvavo.confirm()
    await bitvavo.close()
    await page.getByLabel('Año', { exact: true }).selectOption('2020')
    await expect(rows).toHaveCount(2)
    await rows
      .filter({ hasText: 'Compra' })
      .getByRole('button', { name: 'Ver operación Bitvavo' })
      .click()
    const detail = page.getByRole('dialog', { name: 'Detalle Bitvavo' })
    await expect(detail.getByText('0.01789334395', { exact: true })).toBeVisible()
    await expect(detail.getByText('2020-01-01T00:00:00.000Z', { exact: true })).toBeVisible()
    const other = await browser.newContext({ extraHTTPHeaders: headers })
    try {
      const otherPage = await other.newPage()
      const otherBitvavo = new BitvavoPage(otherPage)
      await otherBitvavo.tracker.goto()
      await otherBitvavo.tracker.openInvestmentMovementsTab()
      await otherPage.getByLabel('Año', { exact: true }).selectOption('2020')
      await expect(otherPage.locator('[data-investment-tx-id]')).toHaveCount(2)
      const exported = await other.request.get('/api/data/export')
      expect(await exported.text()).not.toContain('test-secret')
    } finally {
      await other.close()
    }
  } finally {
    await context.close()
  }
})
