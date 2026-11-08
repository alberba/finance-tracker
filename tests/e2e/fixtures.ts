import { test as base, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { FinanceTrackerPage } from './pages/FinanceTrackerPage'
import { seedSyncV2User, syncV2TestHeaders } from './seed-sync-v2'

declare global {
  interface Window {
    __FINANCE_NAMESPACE__?: string
  }
}

type Fixtures = {
  testUserEmail: string
  tracker: FinanceTrackerPage
  // Freezes `Date` before the app loads. The selected year and month default to
  // today, so a figure asserted in one month differs from the next.
  fixedTime: string | undefined
}

export const test = base.extend<Fixtures>({
  // Playwright requires a destructured first argument, even when empty.
  // eslint-disable-next-line no-empty-pattern
  testUserEmail: async ({}, use) => {
    await use(`pw-${randomUUID()}@e2e.test`)
  },
  extraHTTPHeaders: async ({ testUserEmail }, use) => {
    await use({ 'X-Test-User-Email': testUserEmail })
  },
  fixedTime: [undefined, { option: true }],
  tracker: async ({ page, context, fixedTime, testUserEmail }, use) => {
    if (fixedTime) {
      await page.clock.setFixedTime(new Date(fixedTime))
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
    // Unrelated journeys start after onboarding; the onboarding spec provisions
    // untouched sync-v2 users and exercises the real first show.
    const completed = await context.request.post('/api/sync', {
      headers: await syncV2TestHeaders(context.request, email),
      data: {
        commands: [
          {
            commandId: randomUUID(),
            action: 'settingsUpdate',
            patch: { onboardingPresented: true, onboardingCompleted: true },
          },
        ],
      },
    })
    expect(completed.ok(), await completed.text()).toBe(true)
    const tracker = new FinanceTrackerPage(page)
    await tracker.goto()
    await use(tracker)
  },
})

export { expect }
