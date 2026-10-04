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

type Fixtures = {
  tracker: FinanceTrackerPage
  // Freezes `Date` before the app loads. The selected year and month default to
  // today, so a snapshot taken in one month differs from the next.
  fixedTime: string | undefined
}

const GOOGLE_FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//

export const test = base.extend<Fixtures>({
  // `extraHTTPHeaders` sends the test-auth header to every origin. Google Fonts
  // rejects it in the CORS preflight, and screenshots fall back to system fonts.
  context: async ({ context }, use) => {
    await context.route(GOOGLE_FONTS, async (route) => {
      const headers = { ...route.request().headers() }
      delete headers['x-test-user-email']
      await route.continue({ headers })
    })
    await use(context)
  },
  fixedTime: [undefined, { option: true }],
  tracker: async ({ page, fixedTime }, use) => {
    if (fixedTime) {
      await page.clock.setFixedTime(new Date(fixedTime))
    }
    // The legacy blob is owner-only and no longer accepts a client-selected
    // namespace. Legacy browser specs therefore reset the one owner blob and
    // run serially; multi-user isolation is covered against the relational v2
    // APIs instead of manufacturing tenants inside v1.
    const reset = await page.request.post('/api/state/reset-legacy', { data: {} })
    expect(
      reset.ok(),
      `POST /api/state/reset-legacy devolvió ${reset.status()}. Si es 401/403, faltan TEST_AUTH_ENABLED o LEGACY_OWNER_EMAIL en .dev.vars: ejecuta \`pnpm setup:worktree\`.`,
    ).toBe(true)
    const tracker = new FinanceTrackerPage(page)
    await tracker.goto()
    await use(tracker)
  },
})

export { expect }
