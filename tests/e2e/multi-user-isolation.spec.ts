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
 * **Both storage layers, not just one**: per WP7b's design ("the
 * translation layer is called *alongside*, never instead of, each domain
 * store's existing `commitState` call"), the UI's rendered state — and
 * client-side checks like `settings.ts`'s "ya existe" duplicate guard —
 * still come from the *legacy* `financialStateStore`, namespace-scoped via
 * the `x-finance-namespace` header/`window.__FINANCE_NAMESPACE__`
 * (`src/scripts/state.ts`), exactly as `tests/e2e/fixtures.ts`'s `tracker`
 * fixture sets up for the single-user legacy-path specs. `PUBLIC_SYNC_V2`
 * additionally enqueues sync-v2 commands on top of that; it does not
 * replace it (cutover is WP11). A context that only sets the
 * `X-Test-User-Email` header without *also* giving itself a unique
 * namespace falls back to the default/shared legacy namespace — every
 * "different user" would then collide on that one shared namespace's data,
 * which is precisely the isolation bug this spec exists to catch, so it is
 * important this fixture setup does not itself introduce that false
 * failure. `provisionUser` therefore replicates `fixtures.ts`'s full setup:
 * unique namespace + `reset-legacy` + `window.__FINANCE_NAMESPACE__` in
 * addition to the test-auth-shim header + `/api/state/initialize`.
 */

const TEST_USER_EMAIL_HEADER = 'X-Test-User-Email'

declare global {
  interface Window {
    __FINANCE_NAMESPACE__?: string
  }
}

/** Deterministic per-identity namespace so a returning session (same email, new context) reconnects to the same legacy-layer data. */
function namespaceForEmail(email: string): string {
  return `pw-sync-v2-${email.replace(/[^a-z0-9]/gi, '-')}`
}

async function provisionUser(
  context: BrowserContext,
  email: string,
  options: { resetLegacyNamespace?: boolean } = {},
): Promise<{ tracker: FinanceTrackerPage; page: Page }> {
  const namespace = namespaceForEmail(email)
  await context.setExtraHTTPHeaders({ [TEST_USER_EMAIL_HEADER]: email })
  if (options.resetLegacyNamespace ?? true) {
    // Skipped for a *returning* session re-authenticating as an email
    // already provisioned earlier in the same test — resetting here would
    // wipe the very data that test is asserting persists across sessions.
    await context.request.post('/api/state/reset-legacy', {
      headers: { 'x-finance-namespace': namespace },
    })
  }
  await context.request.post('/api/state/initialize', {
    headers: { [TEST_USER_EMAIL_HEADER]: email },
  })
  const page = await context.newPage()
  await page.addInitScript((value) => {
    window.__FINANCE_NAMESPACE__ = value
  }, namespace)
  const tracker = new FinanceTrackerPage(page)
  await tracker.goto()
  // `goto()` only waits for the SSR-rendered dashboard heading; on a cold
  // dev server the client Vue bundle (nav click handlers, sync-store init)
  // can still be hydrating for a moment after that heading paints. The
  // first nav click in that window registers the button's `[active]` state
  // (a CSS/DOM-level effect) without actually firing the section-switch
  // handler yet — waiting for network idle here gives hydration time to
  // finish before any test interacts with the page.
  await page.waitForLoadState('networkidle')
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
      const { tracker: returningTracker } = await provisionUser(returningContext, email, {
        resetLegacyNamespace: false,
      })
      await returningTracker.filterTransactionsMonth('ENERO')
      await returningTracker.expectTransactionDescriptionVisible('Nómina de A')
    } finally {
      await returningContext.close()
    }
  })
})
