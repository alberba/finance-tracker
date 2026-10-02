import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { FinanceTrackerPage } from './pages/FinanceTrackerPage'

/**
 * WP10 — multi-user isolation E2E, sync-v2 flow (`PUBLIC_SYNC_V2=true`,
 * see `playwright.sync-v2.config.ts`).
 *
 * Two independent browser contexts stand in for "user A" and "user B",
 * each authenticated via the `X-Test-User-Email` shim (`src/middleware.ts`,
 * WP3/WP8 — only honored when `TEST_AUTH_ENABLED=true` and
 * `AUTH_ENFORCED` is off, this repo's CI/dev-only configuration).
 *
 * The v1 blob is intentionally owner-only during cutover. These tests must
 * never reset or namespace that blob for arbitrary identities: each test
 * user is provisioned only in v2 and sync isolation follows the authenticated
 * principal resolved by the server.
 */

const TEST_USER_EMAIL_HEADER = 'X-Test-User-Email'

async function provisionUser(
  context: BrowserContext,
  email: string,
): Promise<{ tracker: FinanceTrackerPage; page: Page }> {
  await context.setExtraHTTPHeaders({ [TEST_USER_EMAIL_HEADER]: email })
  const initialization = await context.request.post('/api/state/initialize', {
    headers: { [TEST_USER_EMAIL_HEADER]: email },
    data: {},
  })
  expect(initialization.ok()).toBe(true)
  const page = await context.newPage()
  const tracker = new FinanceTrackerPage(page)
  await tracker.goto()
  // `goto()` waits for `data-finance-ready=true`, which the application
  // publishes only after state hydration and event binding. Do not wait for
  // `networkidle`: sync-v2 may legitimately keep network work in flight.
  return { tracker, page }
}

function uniqueEmail(label: string): string {
  return `pw-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`
}

test.describe('Aislamiento multiusuario (sync v2)', () => {
  let contextA: BrowserContext
  let contextB: BrowserContext

  test.beforeEach(async ({ browser }) => {
    contextA = await browser.newContext()
    contextB = await browser.newContext()
  })

  test.afterEach(async () => {
    await contextA?.close()
    await contextB?.close()
  })

  test('el movimiento creado por el usuario A no es visible para el usuario B', async () => {
    const { tracker: trackerA } = await provisionUser(contextA, uniqueEmail('a'))
    await trackerA.addAccount({ name: 'Cuenta A', openingBalance: 100 })
    await trackerA.addCustomTransaction({
      date: '2026-01-05',
      monthLabel: 'ENERO',
      type: 'expense',
      categoryLabel: 'Alimentación',
      amount: 42,
      description: 'Gasto exclusivo de A',
    })
    // The transactions list defaults to filtering on the current month —
    // point it at the month the seeded transaction actually falls in.
    await trackerA.filterTransactionsMonth('ENERO')
    await trackerA.expectTransactionDescriptionVisible('Gasto exclusivo de A')

    const { tracker: trackerB } = await provisionUser(contextB, uniqueEmail('b'))
    await trackerB.filterTransactionsMonth('ENERO')

    await expect(
      trackerB.transactionsSection.getByText('Gasto exclusivo de A'),
    ).toHaveCount(0)
  })

  test('el usuario B no ve la cuenta creada por el usuario A', async () => {
    const { tracker: trackerA } = await provisionUser(contextA, uniqueEmail('a2'))
    await trackerA.addAccount({ name: 'Cuenta Secreta de A', openingBalance: 999 })

    const { tracker: trackerB, page: pageB } = await provisionUser(contextB, uniqueEmail('b2'))
    await trackerB.openSettings()

    await expect(pageB.getByText('Cuenta Secreta de A')).toHaveCount(0)
  })

  test('cada usuario conserva sus propios datos entre sesiones (misma identidad, contexto nuevo)', async ({ browser }) => {
    const email = uniqueEmail('owner')
    const { tracker: trackerA } = await provisionUser(contextA, email)
    await trackerA.addAccount({ name: 'Cuenta Persistente', openingBalance: 250 })
    await trackerA.addCustomTransaction({
      date: '2026-01-10',
      monthLabel: 'ENERO',
      type: 'income',
      categoryLabel: 'Nómina',
      amount: 1500,
      description: 'Nómina de A',
    })
    await trackerA.filterTransactionsMonth('ENERO')
    await trackerA.expectTransactionDescriptionVisible('Nómina de A')

    // A brand-new context re-authenticating as the *same* email must see the
    // same data back — isolation is per-identity, not per-browser-session,
    // the reverse assertion of the two tests above.
    const returningContext = await browser.newContext()
    try {
      const { tracker: returningTracker } = await provisionUser(returningContext, email)
      await returningTracker.filterTransactionsMonth('ENERO')
      await returningTracker.expectTransactionDescriptionVisible('Nómina de A')
    } finally {
      await returningContext.close()
    }
  })
})
