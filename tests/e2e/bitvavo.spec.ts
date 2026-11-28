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

    // After reloading, a sync recognizes both operations by identity: nothing doubles.
    await bitvavo.tracker.reload()
    await bitvavo.open()
    await expect(bitvavo.status).toHaveText('Sincronizada')
    await bitvavo.syncNow()
    await expect(bitvavo.notice).toContainText(
      '0 creadas, 0 actualizadas, 2 sin cambios y 0 omitidas',
    )
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

// After the first import: warnings, a recoverable failure, «Requiere atención»,
// key replacement and disconnection, with the provider replaced by headers.
test('keeps synchronizing after the first import and recovers from a revoked key', async ({
  browser,
}) => {
  const email = `bitvavo-sync-${randomUUID()}@e2e.test`
  const nonEuro = {
    ...fixture.transactions[0],
    transactionId: 'example-usd',
    executedAt: '2020-01-02T10:00:00.000Z',
    priceCurrency: 'USD',
  }
  const headers = {
    'X-Test-User-Email': email,
    'X-Test-Bitvavo-History': JSON.stringify([...fixture.transactions, nonEuro]),
  }
  const context = await browser.newContext({ extraHTTPHeaders: headers })
  const accountId = randomUUID()
  try {
    const seeded = await context.request.post('/api/sync', {
      headers: await syncV2TestHeaders(context.request, email),
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
    const imported = async () =>
      ((await (await context.request.get('/api/bootstrap')).json()).transactions as unknown[])
        .length

    await bitvavo.tracker.goto()
    await bitvavo.open()
    await bitvavo.connect(accountId)
    await bitvavo.preview()
    await bitvavo.confirm()

    // Warning: the non-EUR purchase is skipped with its identity and reason.
    await expect(bitvavo.status).toHaveText('Sincronizada con omitidas')
    const skipped = bitvavo.panel.getByRole('region', { name: 'Operaciones omitidas' })
    await expect(skipped).toContainText('example-usd')
    await expect(skipped).toContainText('Precio y comisión deben estar en EUR.')

    await bitvavo.syncNow()
    await expect(bitvavo.notice).toContainText(
      '0 creadas, 0 actualizadas, 2 sin cambios y 1 omitidas',
    )

    // Recoverable failure: the provider is down, the last attempt says so.
    await context.setExtraHTTPHeaders({ ...headers, 'X-Test-Bitvavo-Status': '503' })
    await bitvavo.syncNow()
    await expect(bitvavo.status).toHaveText('Falló el último intento')
    await expect(bitvavo.panel.getByRole('button', { name: 'Sincronizar ahora' })).toBeEnabled()

    // A revoked key leaves the connection in «Requiere atención».
    await context.setExtraHTTPHeaders({ ...headers, 'X-Test-Bitvavo-Status': '401' })
    await bitvavo.syncNow()
    await expect(bitvavo.status).toHaveText('Requiere atención')
    await expect(bitvavo.panel.getByRole('button', { name: 'Sincronizar ahora' })).toBeDisabled()

    await context.setExtraHTTPHeaders(headers)
    await bitvavo.replaceKey()
    await bitvavo.syncNow()
    await expect(bitvavo.status).toHaveText('Sincronizada con omitidas')
    expect(await imported()).toBe(2)

    await bitvavo.disconnect()
    await expect(
      bitvavo.panel.getByRole('button', { name: 'Validar y guardar conexión' }),
    ).toBeAttached()
    expect(await imported()).toBe(2)
  } finally {
    await context.close()
  }
})
