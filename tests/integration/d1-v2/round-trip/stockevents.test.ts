// @vitest-environment happy-dom
/**
 * Round trip for Stock Events settings — the "sincronización no se guarda"
 * report: `enabled`, symbol mappings and cash mappings must survive a
 * reload instead of resetting to unchecked / "No sincronizar efectivo".
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startRoundTrip, type RoundTrip } from "./harness";

describe("round trip: Stock Events", () => {
  let trip: RoundTrip;

  beforeEach(async () => {
    trip = await startRoundTrip();
  });

  afterEach(() => {
    trip.cleanup();
  });

  it("the enabled flag, a symbol mapping and a cash mapping survive a reload", async () => {
    const { useSettingsStore } = await import("../../../../src/stores/settings");
    const { useFinancialStateStore } = await import("../../../../src/stores/financial-state");
    useSettingsStore().addEntity("accounts", "Revolut", "100");
    await trip.reload();
    const accountId = useFinancialStateStore().state.accounts[0]?.id;
    expect(accountId).toBeTruthy();

    const { useStockEventsStore } = await import("../../../../src/stores/stockevents");
    const stockEvents = useStockEventsStore();
    stockEvents.setEnabled(true);
    stockEvents.updateMapping("BTC", { sync: true, watchlistId: "wl-1", targetSymbol: "BTC" });
    stockEvents.updateCashMapping(accountId as string, "wl-1");

    const reloaded = await trip.reload();

    expect(reloaded.stockEvents.enabled).toBe(true);
    expect(reloaded.stockEvents.symbolMappings).toContainEqual({
      symbol: "BTC",
      sync: true,
      watchlistId: "wl-1",
      targetSymbol: "BTC",
      hidden: false,
    });
    expect(reloaded.stockEvents.cashMappings).toContainEqual({
      accountId,
      watchlistId: "wl-1",
    });
  });

  it("disabling sync survives a reload", async () => {
    const { useStockEventsStore } = await import("../../../../src/stores/stockevents");
    const stockEvents = useStockEventsStore();
    stockEvents.setEnabled(true);
    expect((await trip.reload()).stockEvents.enabled).toBe(true);

    useStockEventsStore().setEnabled(false);
    expect((await trip.reload()).stockEvents.enabled).toBe(false);
  });
});
