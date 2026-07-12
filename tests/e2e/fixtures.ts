import { test as base, expect } from '@playwright/test'
import { FinanceTrackerPage } from './pages/FinanceTrackerPage'

declare global {
  interface Window {
    __FINANCE_NAMESPACE__?: string
  }
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
