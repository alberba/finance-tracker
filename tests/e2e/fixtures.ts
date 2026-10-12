import { test as base, expect } from '@playwright/test'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { FinanceTrackerPage } from './pages/FinanceTrackerPage'
import { seedSyncV2User } from './seed-sync-v2'

declare global {
  interface Window {
    __FINANCE_NAMESPACE__?: string
  }
}

type Fixtures = {
  testUserEmail: string
  tracker: FinanceTrackerPage
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
  testUserEmail: async ({ browserName }, use, testInfo) => {
    await use(
      testInfo.tags.includes('@snapshot')
        ? `pw-${browserName}-${createHash('sha256').update(testInfo.testId).digest('hex').slice(0, 16)}@e2e.test`
        : `pw-${randomUUID()}@e2e.test`,
    )
  },
  extraHTTPHeaders: async ({ testUserEmail }, use) => {
    await use({ 'X-Test-User-Email': testUserEmail })
  },
  fixedTime: [undefined, { option: true }],
  snapshotTime: [undefined, { option: true }],
  tracker: async ({ page, context, fixedTime, snapshotTime, testUserEmail }, use, testInfo) => {
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

    const email = testUserEmail
    const initialization = await context.request.post('/api/state/initialize', {
      headers: { 'X-Test-User-Email': email },
      data: {},
    })
    expect(
      initialization.ok(),
      `No se pudo inicializar la identidad E2E (${initialization.status()})`,
    ).toBe(true)
    await seedSyncV2User(context.request, email)

    const tracker = new FinanceTrackerPage(page)
    await tracker.goto()
    await use(tracker)
  },
})

export { expect }
