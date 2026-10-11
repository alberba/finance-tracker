import { test as base, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { FinanceTrackerPage } from './pages/FinanceTrackerPage'
import { seedSyncV2User } from './seed-sync-v2'

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
  syncV2Seed: boolean
  // Freezes `Date` before the app loads. The selected year and month default to
  // today, so a snapshot taken in one month differs from the next.
  fixedTime: string | undefined
  snapshotTime: string | undefined
}

const GOOGLE_FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//

export const test = base.extend<Fixtures>({
  // `extraHTTPHeaders` sends the test-auth header to every origin. Google Fonts
  // rejects it in the CORS preflight, and screenshots fall back to system fonts.
  context: async ({ context }, use, testInfo) => {
    await context.route(GOOGLE_FONTS, async (route) => {
      if (testInfo.tags.includes('@snapshot')) {
        await route.fulfill({ contentType: 'text/css', body: '' })
        return
      }
      const headers = { ...route.request().headers() }
      delete headers['x-test-user-email']
      await route.continue({ headers })
    })
    await use(context)
  },
  fixedTime: [undefined, { option: true }],
  snapshotTime: [undefined, { option: true }],
  tracker: async ({ page, fixedTime, snapshotTime }, use, testInfo) => {
    const snapshot = testInfo.tags.includes('@snapshot')
    const time = snapshot ? snapshotTime : fixedTime
    if (time) {
      await page.clock.setFixedTime(new Date(time))
    }
    if (snapshot) {
      const css = await readFile('tests/e2e/screenshot-stable.css', 'utf8')
      await page.addInitScript((styles) => {
        const insert = () => {
          const style = document.createElement('style')
          style.textContent = styles
          document.documentElement.append(style)
        }
        if (document.documentElement) {
          insert()
        } else {
          const observer = new MutationObserver(() => {
            if (!document.documentElement) return
            observer.disconnect()
            insert()
          })
          observer.observe(document, { childList: true })
        }
      }, css)
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

/** Runs browser scenarios against sync v2 with a fresh, isolated identity. */
export const syncV2Test = test.extend<Fixtures>({
  syncV2Seed: [true, { option: true }],
  tracker: async ({ page, context, fixedTime, snapshotTime, syncV2Seed }, use, testInfo) => {
    const snapshot = testInfo.tags.includes('@snapshot')
    const time = snapshot ? snapshotTime : fixedTime
    if (time) {
      await page.clock.setFixedTime(new Date(time))
    }
    if (snapshot) {
      const css = await readFile('tests/e2e/screenshot-stable.css', 'utf8')
      await page.addInitScript((styles) => {
        const insert = () => {
          const style = document.createElement('style')
          style.textContent = styles
          document.documentElement.append(style)
        }
        if (document.documentElement) {
          insert()
        } else {
          const observer = new MutationObserver(() => {
            if (!document.documentElement) return
            observer.disconnect()
            insert()
          })
          observer.observe(document, { childList: true })
        }
      }, css)
    }

    const email = `pw-${testInfo.workerIndex}-${testInfo.parallelIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`
    await context.setExtraHTTPHeaders({ 'X-Test-User-Email': email })
    const initialization = await context.request.post('/api/state/initialize', {
      headers: { 'X-Test-User-Email': email },
      data: {},
    })
    expect(
      initialization.ok(),
      `No se pudo inicializar la identidad E2E (${initialization.status()})`,
    ).toBe(true)
    if (syncV2Seed) {
      await seedSyncV2User(context.request, email)
    }

    const tracker = new FinanceTrackerPage(page)
    await tracker.goto()
    await use(tracker)
  },
})
