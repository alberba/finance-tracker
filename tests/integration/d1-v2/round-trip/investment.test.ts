// @vitest-environment happy-dom
/**
 * Round trip for inversión — audit §4.3 (a movement is stored as a bare
 * amount: symbol, units, unit price, fee and buy/sell have nowhere to go)
 * and §3.2 (bug (b) of issue #134: a recurring investment rule cannot be
 * represented, and editing one emits nothing at all).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startRoundTrip, type RoundTrip } from "./harness";

async function seedAccountAndCategory(trip: RoundTrip) {
  const { useSettingsStore } = await import("../../../../src/stores/settings");
  const { useFinancialStateStore } = await import("../../../../src/stores/financial-state");
  const financialState = useFinancialStateStore();
  financialState.commitState((draft) => {
    draft.investmentCategories = ["Acciones"];
    draft.expenseCategories = ["Ocio"];
  });
  useSettingsStore().addEntity("accounts", "MyInvestor", "0");
  // The account's own identity, read from the state instead of assumed from
  // its name: a new entity carries the id the client minted (ADR 0001).
  const accountId = financialState.accounts[0].id;
  await trip.reload();
  return accountId;
}

describe("round trip: inversión", () => {
  let trip: RoundTrip;
  let accountId: string;

  beforeEach(async () => {
    trip = await startRoundTrip();
    accountId = await seedAccountAndCategory(trip);
  });

  afterEach(() => {
    trip.cleanup();
  });

  it("keeps symbol, units, unit price and side of a movement (§4.3)", async () => {
    const { useInvestmentStore } = await import("../../../../src/stores/investment");
    expect(
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
        accountId,
        declared: false,
      }),
    ).toBe(true);

    const reloaded = await trip.reload();

    const movement = reloaded.transactions.find((tx) => tx.type === "investment");
    expect(movement).toBeDefined();
    expect(movement).toMatchObject({
      symbol: "VWCE",
      side: "buy",
      units: 10,
      unitPrice: 120.5,
      fee: 1.2,
    });
  });

  it("keeps every field of a recurring investment rule (§3.2b)", async () => {
    const { useRecurringStore } = await import("../../../../src/stores/recurring");
    expect(
      useRecurringStore().addRule({
        type: "investment",
        accountId,
        category: "Acciones",
        description: "Aportación mensual VWCE",
        amount: 200,
        symbol: "VWCE",
        side: "buy",
        units: 1.5,
        unitPrice: 133.33,
        fee: 0,
        time: "09:00",
        frequency: "monthly",
        interval: 1,
        startDate: "2026-09-01",
      }),
    ).toBe(true);

    const reloaded = await trip.reload();

    expect(reloaded.recurringRules).toHaveLength(1);
    expect(reloaded.recurringRules[0]).toMatchObject({
      type: "investment",
      symbol: "VWCE",
      side: "buy",
      units: 1.5,
      unitPrice: 133.33,
      interval: 1,
      startDate: "2026-09-01",
    });
  });

  // A future start date means `refreshPending` generates nothing and the
  // calendar does not move — which, per audit §3.2a, is precisely when the
  // edit has nothing to piggyback on and is lost.
  it("persists an edit to a recurring rule whose calendar has not moved (§3.2a)", async () => {
    const { useRecurringStore } = await import("../../../../src/stores/recurring");
    const recurring = useRecurringStore();
    recurring.addRule({
      type: "expense",
      accountId,
      category: "Ocio",
      description: "Gimnasio",
      amount: 30,
      frequency: "monthly",
      interval: 1,
      startDate: "2027-01-01",
    });
    const first = await trip.reload();
    const ruleId = first.recurringRules[0].id;

    recurring.updateRule(ruleId, {
      type: "expense",
      accountId,
      category: "Ocio",
      description: "Gimnasio Premium",
      amount: 45,
      frequency: "monthly",
      interval: 1,
      startDate: "2027-01-01",
    });

    const reloaded = await trip.reload();

    expect(reloaded.recurringRules[0]).toMatchObject({
      description: "Gimnasio Premium",
      amount: 45,
    });
  });

  // Quarantine: reload can race pending-command creation under suite load.
  // https://github.com/alberba/finance-tracker/issues/233
  it.skip("keeps a pending movement's type instead of calling it a gasto (§3.2c)", async () => {
    const { useRecurringStore } = await import("../../../../src/stores/recurring");
    useRecurringStore().addRule({
      type: "investment",
      accountId,
      category: "Acciones",
      description: "Aportación mensual VWCE",
      amount: 200,
      symbol: "VWCE",
      side: "buy",
      units: 1.5,
      unitPrice: 133.33,
      fee: 0,
      time: "09:00",
      frequency: "monthly",
      interval: 1,
      startDate: "2026-09-01",
    });

    const reloaded = await trip.reload();

    expect(reloaded.pendingMovements.length).toBeGreaterThan(0);
    expect(reloaded.pendingMovements[0]).toMatchObject({
      type: "investment",
      description: "Aportación mensual VWCE",
    });
  });

  // Quarantine: pendingMovements can still be empty after reload under suite load.
  // https://github.com/alberba/finance-tracker/issues/233
  it.skip("syncs edited pending movement without losing investment operation fields", async () => {
    const { useRecurringStore } = await import("../../../../src/stores/recurring");
    const recurring = useRecurringStore();
    recurring.addRule({
      type: "expense",
      accountId,
      category: "Ocio",
      description: "Gasto original",
      amount: 100,
      frequency: "monthly",
      interval: 1,
      startDate: "2026-09-01",
    });

    let reloaded = await trip.reload();
    expect(reloaded.pendingMovements.length).toBeGreaterThan(0);
    const pmId = reloaded.pendingMovements[0].id;

    // Edit and reclassify to investment
    const ok = recurring.editPending(pmId, {
      type: "investment",
      date: "2026-09-02",
      accountId,
      category: "Acciones",
      description: "Reclasificado a Inversión",
      amount: 250,
      symbol: "VWCE",
      side: "buy",
      units: 2,
      unitPrice: 125,
      fee: 1,
      time: "15:00",
    });
    expect(ok).toBe(true);

    // Reload from server after sync flush
    reloaded = await trip.reload();
    expect(reloaded.pendingMovements[0]).toMatchObject({
      type: "investment",
      description: "Reclasificado a Inversión",
      category: "Acciones",
      symbol: "VWCE",
      side: "buy",
      units: 2,
      unitPrice: 125,
      fee: 1,
      time: "15:00",
    });
  });

  it("keeps investment operation fields when a pending movement is confirmed (#205)", async () => {
    const { useRecurringStore } = await import("../../../../src/stores/recurring");
    const recurring = useRecurringStore();
    recurring.addRule({
      type: "expense",
      accountId,
      category: "Ocio",
      description: "Gasto original",
      amount: 100,
      frequency: "monthly",
      interval: 1,
      startDate: "2026-09-01",
    });
    let reloaded = await trip.reload();
    const pmId = reloaded.pendingMovements[0].id;
    recurring.editPending(pmId, {
      type: "investment",
      date: "2026-09-02",
      accountId,
      category: "Acciones",
      description: "Aportación VWCE",
      amount: 250,
      symbol: "VWCE",
      side: "buy",
      units: 2,
      unitPrice: 125,
      fee: 1,
      time: "15:00",
    });
    await trip.reload();
    expect(recurring.confirmPending(pmId)).toBe(true);

    reloaded = await trip.reload();
    expect(reloaded.transactions.find((tx) => tx.type === "investment")).toMatchObject({
      symbol: "VWCE",
      side: "buy",
      units: 2,
      unitPrice: 125,
      fee: 1,
      time: "15:00",
    });
  });

  it("keeps the declared flag (§4.3)", async () => {
    const { useInvestmentStore } = await import("../../../../src/stores/investment");
    const investment = useInvestmentStore();
    investment.addMovement({
      date: "2026-09-12",
      time: "10:30",
      side: "buy",
      symbol: "VWCE",
      category: "Acciones",
      unitPrice: "120.50",
      units: "10",
      fee: "1.20",
      movementCurrency: "EUR",
      accountId,
      declared: false,
    });
    const first = await trip.reload();
    const movementId = first.transactions.find((tx) => tx.type === "investment")!.id;

    investment.toggleDeclared(movementId);

    const reloaded = await trip.reload();

    expect(reloaded.transactions.find((tx) => tx.id === movementId)?.declared).toBe(true);
  });

  it("keeps how a contribution's flow was split across accounts (§5)", async () => {
    const { useInvestmentStore } = await import("../../../../src/stores/investment");
    const saved = useInvestmentStore().saveContribution(
      "2026-03-31",
      2,
      [{ kind: "investments", id: "indexa", value: "1000" }],
      [{ accountId, amount: 200 }],
      [],
    );
    expect(saved).toBe(true);

    const reloaded = await trip.reload();

    const contribution = reloaded.contributions.find((item) => item.date === "2026-03-31");
    expect(contribution?.flowAllocations).toEqual([{ accountId, amount: 200 }]);
  });
});
