import { test as base, expect, type Page } from '@playwright/test'
import { FinanceTrackerPage } from './pages/FinanceTrackerPage'

declare global {
  interface Window {
    __FINANCE_NAMESPACE__?: string
  }
}

/**
 * Mirrors the current localStorage state to the server. The app treats the
 * server as the source of truth on reload, so tests that seed a scenario by
 * mutating localStorage must push it up too — exactly as the real app persists
 * to both stores on every save.
 */
export async function mirrorStateToServer(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const raw = localStorage.getItem('finance-tracker-state-v1')
    if (!raw) {
      return
    }
    await fetch('/api/state', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-finance-namespace': window.__FINANCE_NAMESPACE__ ?? '',
      },
      body: JSON.stringify({ state: JSON.parse(raw) }),
    })
  })
}

/**
 * Header consumed by `src/middleware.ts`'s test-only auth shim (WP8) — see
 * that file's doc comment. Only honored when the server has
 * `TEST_AUTH_ENABLED=true` (this repo's `.dev.vars`/CI, never a real
 * deployment) *and* `AUTH_ENFORCED` is off, which is also this repo's
 * default everywhere pre-cutover.
 */
const TEST_USER_EMAIL_HEADER = 'X-Test-User-Email'

type Fixtures = {
  tracker: FinanceTrackerPage
  /** The per-test synthetic email attached as `principal.userId` via the auth shim. */
  testUserEmail: string
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  testUserEmail: async ({}, use) => {
    const email = `pw-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@e2e.test`
    await use(email)
  },

  tracker: async ({ page, request, testUserEmail }, use) => {
    // Legacy path (`PUBLIC_SYNC_V2` off, the default — see
    // `src/scripts/state.ts`): the app still keys everything off a
    // client-supplied namespace header, not `Astro.locals.principal`. A
    // fresh, unique-per-test namespace auto-seeds on first `GET /api/state`
    // (see Contradiction #8 in docs/migration/work-packages.md), so an
    // explicit reset isn't required for isolation — `reset-legacy` is called
    // anyway for parity with the old behavior and to guard against a
    // (astronomically unlikely) namespace collision.
    const namespace = `pw-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    await request.post('/api/state/reset-legacy', {
      headers: { 'x-finance-namespace': namespace },
    })

    // v2 path (`PUBLIC_SYNC_V2` on): attach the test-auth-shim header to
    // every request this browser context makes (navigation + fetch/XHR from
    // the page), then provision the matching principal via the same
    // idempotent `POST /api/state/initialize` a real "empezar de cero" click
    // uses (WP4/WP8). Best-effort: when the flag isn't on (this repo's
    // non-e2e dev default, or `AUTH_ENFORCED=true`), the shim no-ops and this
    // call 401s harmlessly — nothing here is required by the legacy flow.
    await page.context().setExtraHTTPHeaders({ [TEST_USER_EMAIL_HEADER]: testUserEmail })
    await request
      .post('/api/state/initialize', {
        headers: { [TEST_USER_EMAIL_HEADER]: testUserEmail },
      })
      .catch(() => undefined)

    await page.addInitScript((value) => {
      window.__FINANCE_NAMESPACE__ = value
    }, namespace)
    const tracker = new FinanceTrackerPage(page)
    await tracker.goto()
    await use(tracker)
  },
})

export { expect }
