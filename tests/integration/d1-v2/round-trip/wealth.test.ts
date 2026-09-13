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

  beforeEach(async () => {
    trip = await startRoundTrip();
    const { useSettingsStore } = await import("../../../../src/stores/settings");
    useSettingsStore().addEntity("accounts", "Revolut", "0");
    await trip.reload();
  });

  afterEach(() => {
    trip.cleanup();
  });

  it("keeps the balances the user typed (§4.2)", async () => {
    const { useWealthStore } = await import("../../../../src/stores/wealth");
    useWealthStore().setMonth(2);
    useWealthStore().saveSnapshot([{ kind: "accounts", id: "revolut", value: "1250.40" }]);

    const reloaded = await trip.reload();

    expect(reloaded.snapshots["2"]?.accounts?.revolut).toBe(1250.4);
  });

  it("keeps editing an existing snapshot (§4.2)", async () => {
    const { useWealthStore } = await import("../../../../src/stores/wealth");
    const wealth = useWealthStore();
    wealth.setMonth(2);
    wealth.saveSnapshot([{ kind: "accounts", id: "revolut", value: "1000" }]);
    await trip.reload();

    wealth.setMonth(2);
    wealth.saveSnapshot([{ kind: "accounts", id: "revolut", value: "2000" }]);

    const reloaded = await trip.reload();

    expect(reloaded.snapshots["2"]?.accounts?.revolut).toBe(2000);
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
    wealth.saveSnapshot([{ kind: "accounts", id: "revolut", value: "1000" }]);
    await trip.reload();

    financialState.commitState((draft) => {
      draft.year = 2026;
    });
    wealth.setMonth(2);
    wealth.saveSnapshot([{ kind: "accounts", id: "revolut", value: "2000" }]);
    await trip.reload();

    const wealthRepository = await import("../../../../src/db/repositories/wealth");
    const snapshots = await wealthRepository.listByUser(trip.testDb.db, trip.userId);
    expect(snapshots.map((snapshot) => snapshot.year).sort()).toEqual([2025, 2026]);
  });
});
