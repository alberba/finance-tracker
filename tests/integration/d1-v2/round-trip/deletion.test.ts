// @vitest-environment happy-dom
/**
 * Round trip for borrados — audit §2.6: D1 enforces every FK and the DDL
 * declares no `ON DELETE CASCADE`, so a delete that doesn't clean up what it
 * owns, or reject what it doesn't, used to surface as a raw
 * `FOREIGN KEY constraint failed` (a 500 that jams the sync queue) instead
 * of either quietly succeeding or telling the user why it can't.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startRoundTrip, type RoundTrip } from "./harness";

async function seedAccountAndCategory(trip: RoundTrip) {
  const { useFinancialStateStore } = await import("../../../../src/stores/financial-state");
  const { useSettingsStore } = await import("../../../../src/stores/settings");
  useFinancialStateStore().commitState((draft) => {
    draft.expenseCategories = ["Ocio"];
    draft.investmentCategories = ["Acciones"];
  });
  useSettingsStore().addEntity("accounts", "Revolut", "100");
  await trip.reload();
}

describe("round trip: borrar avisa en vez de fallar", () => {
  let trip: RoundTrip;

  beforeEach(async () => {
    trip = await startRoundTrip();
    await seedAccountAndCategory(trip);
  });

  afterEach(() => {
    trip.cleanup();
  });

  it("deleting an investment movement deletes its operation with it, without error (§2.6)", async () => {
    const { useInvestmentStore } = await import("../../../../src/stores/investment");
    const { useMovementsStore } = await import("../../../../src/stores/movements");
    useInvestmentStore().addMovement({
      date: "2026-09-12",
      time: "10:30",
      side: "buy",
      symbol: "VWCE",
      category: "Acciones",
      unitPrice: "120.50",
      units: "10",
      fee: "1.20",
      movementCurrency: "EUR",
      accountId: "revolut",
      declared: false,
    });
    const withMovement = await trip.reload();
    const movementId = withMovement.transactions.find((tx) => tx.type === "investment")!.id;

    useMovementsStore().deleteTransaction(movementId);

    const reloaded = await trip.reload();

    expect(reloaded.transactions).toHaveLength(0);
    expect(trip.syncStore.lastError).toBeFalsy();

    const transactionsRepository = await import("../../../../src/db/repositories/transactions");
    expect(
      await transactionsRepository.getTradeDetailByTransaction(trip.testDb.db, trip.userId, movementId),
    ).toBeUndefined();
  });

  it("deleting an account still in use warns instead of failing, and keeps the data (§2.6)", async () => {
    const { useMovementsStore } = await import("../../../../src/stores/movements");
    useMovementsStore().addTransaction({
      date: "2026-09-01",
      month: 9,
      type: "expense",
      accountId: "revolut",
      category: "Ocio",
      description: "Cine",
      amount: 12,
    });
    await trip.reload();

    const { useSettingsStore } = await import("../../../../src/stores/settings");
    useSettingsStore().removeEntity("accounts", "revolut");

    await vi.waitFor(async () => {
      await trip.syncStore.flush();
      expect(trip.syncStore.lastError).toMatch(/tiene movimientos/i);
    });

    const reloaded = await trip.reload();

    expect(reloaded.accounts).toHaveLength(1);
    expect(reloaded.transactions).toHaveLength(1);
  });

  it("deleting a category still in use warns instead of failing, and keeps the data (§2.6)", async () => {
    // A category must already be a *synced* row — not just a locally-known
    // name — for a transaction created afterwards to carry its real
    // `categoryId` instead of the `null` a same-batch first reference gets
    // (audit §4.7), which is what `removeCategory`'s in-use check reads.
    const { useSettingsStore } = await import("../../../../src/stores/settings");
    useSettingsStore().addCategory("expenseCategories", "Transporte");
    await trip.reload();

    const { useMovementsStore } = await import("../../../../src/stores/movements");
    useMovementsStore().addTransaction({
      date: "2026-09-01",
      month: 9,
      type: "expense",
      accountId: "revolut",
      category: "Transporte",
      description: "Metro",
      amount: 12,
    });
    await trip.reload();

    useSettingsStore().removeCategory("expenseCategories", "Transporte");

    await vi.waitFor(async () => {
      await trip.syncStore.flush();
      expect(trip.syncStore.lastError).toMatch(/en uso/i);
    });

    const reloaded = await trip.reload();

    expect(reloaded.expenseCategories).toContain("Transporte");
    expect(reloaded.transactions).toHaveLength(1);
    expect(reloaded.transactions[0].category).toBe("Transporte");
  });

  it("deleting a recurring rule with a pending occurrence does not fail (§2.6)", async () => {
    // Seeded directly (like a row the v1 migration would have written)
    // instead of through `addRule` + `refreshPending`, whose occurrence
    // generation depends on the real clock — this test only cares that
    // *removing* a rule that already has a pending occurrence attached to
    // it (`pending_movements.recurring_rule_id` is NOT NULL, no cascade in
    // the DDL) never surfaces a raw FK violation.
    trip.cleanup();
    trip = await startRoundTrip(async (db, userId) => {
      const accountsRepository = await import("../../../../src/db/repositories/accounts");
      const recurringRulesRepository = await import("../../../../src/db/repositories/recurring-rules");
      const pendingMovementsRepository = await import("../../../../src/db/repositories/pending-movements");
      const account = await accountsRepository.create(db, userId, {
        name: "Revolut",
        kind: "cash",
        currency: "EUR",
        openingBalance: 0,
        legacyId: "revolut",
      });
      const rule = await recurringRulesRepository.create(db, userId, {
        name: "Aportación mensual VWCE",
        type: "investment",
        accountId: account.id,
        amount: 200,
        currency: "EUR",
        frequency: "monthly",
        legacyId: "rule-1",
      });
      await pendingMovementsRepository.create(db, userId, {
        recurringRuleId: rule.id,
        accountId: account.id,
        amount: 200,
        currency: "EUR",
        dueDate: "2026-10-01",
      });
    });

    const withRule = await trip.reload();
    expect(withRule.recurringRules).toHaveLength(1);
    expect(withRule.pendingMovements).toHaveLength(1);
    const ruleId = withRule.recurringRules[0].id;

    const { useRecurringStore } = await import("../../../../src/stores/recurring");
    useRecurringStore().removeRule(ruleId);
    await trip.syncStore.flush();

    const reloaded = await trip.reload();

    expect(reloaded.recurringRules).toHaveLength(0);
    expect(reloaded.pendingMovements).toHaveLength(0);
  });
});
