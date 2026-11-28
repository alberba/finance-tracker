import { test, expect, type APIRequestContext } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import fixture from '../unit/fixtures/bitvavo-real-sanitized.json' with { type: 'json' }
import { BitvavoPage } from './pages/BitvavoPage'
import { syncV2TestHeaders } from './seed-sync-v2'

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
    const syncHeaders = await syncV2TestHeaders(context.request, email)
    const seeded = await context.request.post('/api/sync', {
      headers: syncHeaders,
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
    const imported = async (request: APIRequestContext) => {
      const response = await request.get('/api/bootstrap')
      return ((await response.json()).transactions as unknown[]).length
    }
    await bitvavo.tracker.goto()
    await bitvavo.open()
    await bitvavo.connect(accountId)
    await bitvavo.preview()
    await expect(bitvavo.panel.getByText('0,00008878285', { exact: true })).toBeVisible()
    await bitvavo.confirm()
    await bitvavo.close()
    await expect.poll(() => imported(context.request)).toBe(2)

    // A second preview after reloading knows both operations: nothing doubles.
    await bitvavo.tracker.reload()
    await bitvavo.open()
    await bitvavo.preview()
    await expect(bitvavo.panel.getByText('Ya importado', { exact: true })).toHaveCount(2)
    await bitvavo.close()
    expect(await imported(context.request)).toBe(2)

    const other = await browser.newContext({ extraHTTPHeaders: headers })
    try {
      expect(await imported(other.request)).toBe(2)
      const exported = await other.request.get('/api/data/export')
      const exportedText = await exported.text()
      expect(exportedText).not.toContain('test-secret')
      expect(exportedText).toContain('0.01789334395')
    } finally {
      await other.close()
    }
  } finally {
    await context.close()
  }
})
