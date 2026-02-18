import { test as base, expect } from "@playwright/test";
import { FinanceTrackerPage } from "./pages/FinanceTrackerPage";

type Fixtures = {
  tracker: FinanceTrackerPage;
};

export const test = base.extend<Fixtures>({
  tracker: async ({ page }, use) => {
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
