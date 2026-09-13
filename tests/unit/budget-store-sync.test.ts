import "fake-indexeddb/auto";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/scripts/demo-mode", () => ({ isDemoMode: vi.fn(() => false) }));

import { categoryLocalId } from "../../src/lib/client/command-mapping";
import { openIdbCache, putEntity, wipeIdbCache } from "../../src/lib/client/idb-cache";
import { listAll, openOutbox, wipeOutbox } from "../../src/lib/client/outbox";
import { useBudgetStore } from "../../src/stores/budget";
import { useFinancialStateStore } from "../../src/stores/financial-state";
import { useSyncStore } from "../../src/stores/sync";

const USER_ID = "user-budget-store-test";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only store handle, closed in afterEach
let activeStore: any = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * A budgetEntry's identity (`categoryId`/`year`/`month`) must never travel
 * in an `update` — `entityUpdateSchemas.budgetEntry` only declares
 * `amount`/`currency` (narrower than every other entity's `.partial()`
 * update schema). Regression test for the fix in `src/stores/budget.ts` and
 * `syncUpsert`'s `updateData` parameter: making the per-entity schemas
 * strict (issue #138) would otherwise reject the *second* edit of an
 * already-synced budget cell, because `buildBudgetEntryData` always
 * recomputes the full identity + value shape.
 */
describe("budget store — sync wiring keeps identity out of the update patch (issue #138)", () => {
  beforeEach(async () => {
    vi.stubEnv("PUBLIC_SYNC_V2", "true");
    setActivePinia(createPinia());
    await wipeIdbCache(USER_ID);
    await wipeOutbox(USER_ID);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (activeStore) {
      await activeStore.logout();
      activeStore = null;
    }
    await wipeIdbCache(USER_ID);
    await wipeOutbox(USER_ID);
  });

  it("sends the full identity on the first edit and only amount/currency on the second", async () => {
    const syncStore = useSyncStore();
    await syncStore.init(USER_ID);
    syncStore.connection = "offline"
    activeStore = syncStore;

    // The category has already synced, so `resolveCategoryId` resolves
    // immediately instead of deferring the budget entry to a later edit.
    const cacheDb = await openIdbCache(USER_ID);
    await putEntity(cacheDb, "category", {
      id: "server-cat-1",
      legacyId: categoryLocalId("expense", "Ocio"),
      version: 0,
    });
    cacheDb.close();

    useFinancialStateStore().commitState((draft) => {
      draft.expenseCategories = ["Ocio"];
    });

    const budgetStore = useBudgetStore();
    budgetStore.updateBudgetValue("expense", "Ocio", 0, 100);
    await settle();

    const outboxDb = await openOutbox(USER_ID);
    const afterFirstEdit = await listAll(outboxDb);
    expect(afterFirstEdit).toHaveLength(1);
    expect(afterFirstEdit[0]?.command).toMatchObject({
      action: "create",
      entityType: "budgetEntry",
      data: { categoryId: "server-cat-1", year: expect.any(Number), month: 1, amount: 100, currency: "EUR" },
    });
    outboxDb.close();

    // Simulate the create having synced: seed the cache with the server row
    // so the next edit resolves it as an update instead of folding into the
    // still-pending create.
    const cacheDb2 = await openIdbCache(USER_ID);
    await putEntity(cacheDb2, "budgetEntry", {
      id: "server-budget-entry-1",
      legacyId: "expense:Ocio:1",
      version: 0,
    });
    cacheDb2.close();

    budgetStore.updateBudgetValue("expense", "Ocio", 0, 250);
    await settle();

    const outboxDb2 = await openOutbox(USER_ID);
    const afterSecondEdit = await listAll(outboxDb2);
    const update = afterSecondEdit.find((entry) => entry.command.action === "update");
    expect(update?.command).toMatchObject({
      action: "update",
      entityType: "budgetEntry",
      entityId: "server-budget-entry-1",
      patch: { amount: 250, currency: "EUR" },
    });
    // The identity fields must not be present at all — not just ignored.
    expect(update?.command).toMatchObject({ patch: expect.not.objectContaining({ categoryId: expect.anything() }) });
    if (update?.command.action === "update") {
      expect(Object.keys(update.command.patch)).toEqual(["amount", "currency"]);
    }
    outboxDb2.close();
  });
});
