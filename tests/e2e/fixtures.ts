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
}

export const test = base.extend<Fixtures>({
  tracker: async ({ page, request }, use) => {
    const namespace = `pw-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    await request.post('/api/state/reset', {
      headers: {
        'x-finance-namespace': namespace,
      },
    })
    await page.addInitScript((value) => {
      window.__FINANCE_NAMESPACE__ = value
    }, namespace)
    const tracker = new FinanceTrackerPage(page)
    await tracker.goto()
    await use(tracker)
  },
})

export { expect }
