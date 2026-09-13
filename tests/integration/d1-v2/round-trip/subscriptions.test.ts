// @vitest-environment happy-dom
/**
 * Round trip for subscriptions — audit §3.1, bug (a) of issue #134.
 *
 * The row does reach D1; what fails is reading it back, so only a test that
 * crosses both directions can see it.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startRoundTrip, type RoundTrip } from "./harness";

describe("round trip: subscriptions", () => {
  let trip: RoundTrip;

  beforeEach(async () => {
    trip = await startRoundTrip();
  });

  afterEach(() => {
    trip.cleanup();
  });

  it("a subscription the user creates is still there after a reload", async () => {
    const { useFinancialStateStore } = await import("../../../../src/stores/financial-state");
    const { useSettingsStore } = await import("../../../../src/stores/settings");
    const { useMovementsStore } = await import("../../../../src/stores/movements");

    const financialState = useFinancialStateStore();
    financialState.commitState((draft) => {
      draft.expenseCategories = ["Ocio"];
    });
    useSettingsStore().addEntity("accounts", "Revolut", "0");
    await trip.reload();

    const accountId = financialState.accounts[0].id;
    expect(
      useMovementsStore().addSubscription({
        name: "Netflix",
        amount: 13.99,
        accountId,
        category: "Ocio",
        frequency: "monthly",
        firstChargeDate: "2026-09-12",
      }),
    ).toBe(true);

    const reloaded = await trip.reload();

    // The write half works: the row really is in D1. Everything that follows
    // is about reading it back (audit §3.1).
    const stored = await import("../../../../src/db/repositories/subscriptions").then((repo) =>
      repo.listByUser(trip.testDb.db, trip.userId),
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Netflix");

    expect(reloaded.subscriptions).toHaveLength(1);
    expect(reloaded.subscriptions[0]).toMatchObject({
      name: "Netflix",
      amount: 13.99,
      category: "Ocio",
      startDate: "2026-09-12",
    });
  });
});
