import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { FinanceTrackerPage } from './pages/FinanceTrackerPage'

/**
 * WP10 — offline CRUD + sync-on-reconnect E2E, sync-v2 flow
 * (`PUBLIC_SYNC_V2=true`, see `playwright.sync-v2.config.ts`).
 *
 * The engine under test is `src/stores/sync.ts` (WP7): every domain
 * mutation is optimistic (written to IndexedDB immediately, queued in the
 * outbox) regardless of connectivity — `context.setOffline(true)` just
 * proves the "offline" and "online" cases are the same code path, per that
 * WP's design decision.
 *
 * A same-user conflict (ADR 0003) is reapplied automatically over the
 * server's current version, with a discreet toast — there is no
 * conflict-resolution dialog to wait on any more.
 */

const TEST_USER_EMAIL_HEADER = 'X-Test-User-Email'
const SYNC_STATUS = '#sidebar-sync-status'

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
  // `goto()` waits for the app's explicit post-hydration readiness marker.
  // Sync-v2 can keep network work in flight, so `networkidle` is not a safe
  // proxy for readiness here.
  return { tracker, page }
}

function uniqueEmail(label: string): string {
  return `pw-offline-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`
}

/**
 * Waits for `#sidebar-sync-status` to read "Sincronizado" and *stay* that
 * way.
 *
 * WP10 fix: a bare single check races the `/api/session` →
 * `syncStore.init()` → `/api/changes` (pull) → `/api/sync` (flush) chain —
 * `syncStatus` defaults to `'idle'` ("Sincronizado" with no "N
 * pendiente(s)" suffix) *before* that chain has even started, and a
 * fire-and-forget mutation (`void syncListDiff(...)`, called from a
 * form-save handler that resolves synchronously with the save itself) can
 * likewise not have reached its first `await` yet. Waiting for
 * `networkidle` (no in-flight requests for 500ms) after the first sighting
 * rides out whichever leg of that chain was still pending, then the
 * second check confirms it actually landed on "nothing left to sync"
 * rather than a stale snapshot from before any of it began.
 */
async function waitForSynced(page: Page): Promise<void> {
  await expect(page.locator(SYNC_STATUS)).toContainText('Sincronizado', { timeout: 15000 })
  await page.waitForLoadState('networkidle')
  await expect(page.locator(SYNC_STATUS)).toContainText('Sincronizado', { timeout: 15000 })
}

test.describe('Sincronización offline (sync v2)', () => {
  test('CRUD sin conexión persiste localmente y se sincroniza al reconectar, sin duplicados', async ({ browser }) => {
    const context = await browser.newContext()
    try {
      const { tracker, page } = await provisionUser(context, uniqueEmail('crud'))
      await tracker.addAccount({ name: 'Cuenta Offline', openingBalance: 0 })
      await waitForSynced(page)

      await context.setOffline(true)

      await tracker.addCustomTransaction({
        date: '2026-02-01',
        monthLabel: 'FEBRERO',
        type: 'expense',
        categoryLabel: 'Alimentación',
        amount: 15,
        description: 'Compra sin conexión',
      })
      // The transactions list defaults to filtering on the current month —
      // point it at the month the seeded transaction actually falls in.
      // `filterTransactionsMonth` only touches an in-page <select>, so it
      // works while offline too.
      await tracker.filterTransactionsMonth('FEBRERO')
      await tracker.expectTransactionDescriptionVisible('Compra sin conexión')

      // Note: a `page.reload()` *while offline* isn't exercised here —
      // `context.setOffline(true)` blocks the reload's own navigation
      // request at the network layer (`net::ERR_INTERNET_DISCONNECTED`),
      // which is a plain Chromium/Playwright limitation unrelated to the
      // app (there's no service worker serving the shell from cache). The
      // optimistic-write-survives-without-a-round-trip claim is still
      // exercised: the row is visible immediately after the offline write
      // above with no server request having succeeded yet.

      await context.setOffline(false)
      await waitForSynced(page)

      // Reload again post-sync: the row must appear exactly once, proving
      // the outbox replay didn't duplicate it on reconnect.
      await tracker.reload()
      await tracker.filterTransactionsMonth('FEBRERO')
      const rows = tracker.transactionsSection.locator('#tx-table-body tr', {
        hasText: 'Compra sin conexión',
      })
      await expect(rows).toHaveCount(1)
    } finally {
      await context.close()
    }
  })

  test('una edición concurrente en dos dispositivos se resuelve sola, sin diálogo ni cola congelada', async ({ browser }) => {
    const email = uniqueEmail('conflict')
    const contextDeviceOne = await browser.newContext()
    const contextDeviceTwo = await browser.newContext()

    try {
      // Device 1 creates the account + transaction and syncs it, then a
      // second "device" (fresh context, same identity) pulls it down.
      const { tracker: deviceOne, page: pageOne } = await provisionUser(contextDeviceOne, email)
      await deviceOne.addAccount({ name: 'Cuenta Compartida', openingBalance: 0 })
      // Wait for the account's own `create` command to sync before
      // referencing it from a transaction: a *seeded* account (the
      // `addCustomTransaction` default, "Revolut") has no v2 `account`
      // row at all — `resolveEntityId` can never resolve it, so the
      // transaction's own sync-v2 create would be silently skipped
      // forever (see the doc comment on `addCustomTransaction`'s
      // `accountLabel` param). Only a freshly-created, already-synced
      // account round-trips correctly.
      await waitForSynced(pageOne)
      await deviceOne.addCustomTransaction({
        date: '2026-02-05',
        monthLabel: 'FEBRERO',
        type: 'expense',
        categoryLabel: 'Alimentación',
        amount: 20,
        description: 'Movimiento en disputa',
        accountLabel: 'Cuenta Compartida',
      })
      await deviceOne.filterTransactionsMonth('FEBRERO')
      await waitForSynced(pageOne)

      const { tracker: deviceTwo, page: pageTwo } = await provisionUser(contextDeviceTwo, email)
      await deviceTwo.filterTransactionsMonth('FEBRERO')
      await deviceTwo.expectTransactionDescriptionVisible('Movimiento en disputa')
      // Wait for device two's *pull* (not just "nothing queued to push") to
      // land before editing offline: `getEntityRef` only ever resolves
      // entities present in `cacheDb`, which this device populates
      // asynchronously from `GET /api/changes` on first load — without
      // this, `editTransactionByDescription` below can race that pull and
      // silently no-op (see `useSyncStore`'s `syncNow` doc comment).
      await waitForSynced(pageTwo)

      // Both devices go offline and edit the *same* row independently.
      await contextDeviceOne.setOffline(true)
      await contextDeviceTwo.setOffline(true)

      await deviceOne.editTransactionByDescription('Movimiento en disputa', {
        amount: 21,
      })
      await deviceTwo.editTransactionByDescription('Movimiento en disputa', {
        amount: 22,
      })

      // Device 1 reconnects first and wins the race — its edit becomes the
      // server's current version.
      await contextDeviceOne.setOffline(false)
      await waitForSynced(pageOne)

      // Device 2 reconnects with a now-stale `baseVersion` for the same
      // row: `apply-command.ts`'s optimistic-concurrency check rejects it
      // as a conflict — but per ADR 0003 there is no dialog to resolve. It
      // is reapplied automatically over device one's version, and the user
      // gets a discreet notice instead of a choice to make.
      await contextDeviceTwo.setOffline(false)
      await expect(pageTwo.locator('#toast')).toContainText(
        'se reaplicó sobre la versión más reciente',
        { timeout: 15000 },
      )
      await expect(pageTwo.locator('[data-conflict-resolution-dialog]')).toHaveCount(0)
      await waitForSynced(pageTwo)

      // The queue kept moving through the conflict and drained on its own —
      // device two's own edit is what both devices see after reloading.
      await deviceTwo.reload()
      await deviceTwo.filterTransactionsMonth('FEBRERO')
      const disputedRow = deviceTwo.transactionsSection.locator('#tx-table-body tr', {
        hasText: 'Movimiento en disputa',
      })
      await expect(disputedRow).toContainText('22,00 €')
    } finally {
      await contextDeviceOne.close()
      await contextDeviceTwo.close()
    }
  })
})
