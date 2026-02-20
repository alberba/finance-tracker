import { test as base, expect } from "@playwright/test";
import { FinanceTrackerPage } from "./pages/FinanceTrackerPage";

type Fixtures = {
  tracker: FinanceTrackerPage;
};

export const test = base.extend<Fixtures>({
  tracker: async ({ page, request }, use) => {
    const namespace = `pw-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await request.post("/api/state/reset", {
      headers: {
        "x-finance-namespace": namespace,
      },
    });
    await page.addInitScript((value) => {
      (window as any).__FINANCE_NAMESPACE__ = value;
    }, namespace);
    const tracker = new FinanceTrackerPage(page);
    await tracker.goto();
    await page.evaluate(() => {
      window.localStorage.clear();
    });
    await tracker.reload();
    await use(tracker);
  },
});

export { expect };
