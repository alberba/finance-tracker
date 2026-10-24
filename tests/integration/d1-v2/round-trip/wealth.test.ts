// @vitest-environment happy-dom
/**
 * Round trip for Patrimonio — audit §4.2 (the balances the user types are
 * never written: only the snapshot's existence is) and §4.6 (a snapshot is
 * keyed by month alone, so two years collide).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startRoundTrip, type RoundTrip } from "./harness";

describe("round trip: patrimonio", () => {
  let trip: RoundTrip;
  // The account's own identity — read from the state, not assumed from its
  // name: an entity created from now on carries the id the client minted for
  // it (ADR 0001).
  let accountId: string;

  beforeEach(async () => {
    trip = await startRoundTrip();
    const { useSettingsStore } = await import("../../../../src/stores/settings");
    const { useFinancialStateStore } = await import("../../../../src/stores/financial-state");
    useSettingsStore().addEntity("accounts", "Revolut", "0");
    accountId = useFinancialStateStore().accounts[0].id;
    await trip.reload();
  });

  afterEach(() => {
    trip.cleanup();
  });

  it("keeps the balances the user typed (§4.2)", async () => {
    const { useWealthStore } = await import("../../../../src/stores/wealth");
    useWealthStore().setMonth(2);
    useWealthStore().saveSnapshot([{ kind: "accounts", id: accountId, value: 1250.4 }]);

    const reloaded = await trip.reload();

    expect(reloaded.snapshots["2"]?.accounts?.[accountId]).toBe(1250.4);
  });

  it("keeps editing an existing snapshot (§4.2)", async () => {
    const { useWealthStore } = await import("../../../../src/stores/wealth");
    const wealth = useWealthStore();
    wealth.setMonth(2);
    wealth.saveSnapshot([{ kind: "accounts", id: accountId, value: 1000 }]);
    await trip.reload();

    const reloadedWealth = useWealthStore();
    reloadedWealth.setMonth(2);
    reloadedWealth.saveSnapshot([{ kind: "accounts", id: accountId, value: 2000 }]);

    const reloaded = await trip.reload();

    expect(reloaded.snapshots["2"]?.accounts?.[accountId]).toBe(2000);
  });

  it("keeps November and December apart (§4.6)", async () => {
    const { useWealthStore } = await import("../../../../src/stores/wealth");
    const wealth = useWealthStore();

    wealth.setMonth(10);
    wealth.saveSnapshot([{ kind: "accounts", id: accountId, value: 1000 }]);
    wealth.setMonth(11);
    wealth.saveSnapshot([{ kind: "accounts", id: accountId, value: 2000 }]);

    const reloaded = await trip.reload();

    expect(reloaded.snapshots["10"]?.accounts?.[accountId]).toBe(1000);
    expect(reloaded.snapshots["11"]?.accounts?.[accountId]).toBe(2000);
  });

  it("reads the snapshot of the state's year, not another year's, for the same month (§4.6)", async () => {
    const accountsRepository = await import("../../../../src/db/repositories/accounts");
    const wealthRepository = await import("../../../../src/db/repositories/wealth");
    const [account] = await accountsRepository.listByUser(trip.testDb.db, trip.userId);
    if (!account) throw new Error("missing account fixture");

    // The previous year's row is written *after* this year's, so a projection
    // that drops the year and keys by month alone would let it win the slot.
    const year = new Date().getFullYear();
    const currentYear = await wealthRepository.create(trip.testDb.db, trip.userId, {
      snapshotDate: `${year}-03-01`,
      year,
      month: 3,
    });
    await wealthRepository.createBalance(trip.testDb.db, trip.userId, {
      snapshotId: currentYear.id,
      accountId: account.id,
      balance: 2000,
      currency: "EUR",
    });
    const previousYear = await wealthRepository.create(trip.testDb.db, trip.userId, {
      snapshotDate: `${year - 1}-03-01`,
      year: year - 1,
      month: 3,
    });
    await wealthRepository.createBalance(trip.testDb.db, trip.userId, {
      snapshotId: previousYear.id,
      accountId: account.id,
      balance: 1000,
      currency: "EUR",
    });

    const reloaded = await trip.reload();

    expect(reloaded.snapshots["3"]?.accounts?.[accountId]).toBe(2000);
  });

  it("does not mix up snapshots from two different years (§4.6)", async () => {
    const { useFinancialStateStore } = await import("../../../../src/stores/financial-state");
    const { useWealthStore } = await import("../../../../src/stores/wealth");
    const financialState = useFinancialStateStore();
    const wealth = useWealthStore();

    financialState.commitState((draft) => {
      draft.year = 2025;
    });
    wealth.setMonth(2);
    wealth.saveSnapshot([{ kind: "accounts", id: accountId, value: 1000 }]);
    await trip.reload();

    useFinancialStateStore().commitState((draft) => {
      draft.year = 2026;
    });
    const reloadedWealth = useWealthStore();
    reloadedWealth.setMonth(2);
    reloadedWealth.saveSnapshot([{ kind: "accounts", id: accountId, value: 2000 }]);
    await trip.reload();

    const wealthRepository = await import("../../../../src/db/repositories/wealth");
    const snapshots = await wealthRepository.listByUser(trip.testDb.db, trip.userId);
    expect(snapshots.map((snapshot) => snapshot.year).sort()).toEqual([2025, 2026]);
  });
});
