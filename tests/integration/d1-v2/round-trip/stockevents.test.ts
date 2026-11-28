// @vitest-environment happy-dom
/**
 * Round trip for Stock Events settings — the "sincronización no se guarda"
 * report: `enabled` must survive a reload instead of resetting to unchecked.
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

  it("the enabled flag survives a reload, and so does disabling it", async () => {
    const { useStockEventsStore } = await import("../../../../src/stores/stockevents");
    const stockEvents = useStockEventsStore();
    stockEvents.setEnabled(true);
    expect((await trip.reload()).stockEvents.enabled).toBe(true);

    useStockEventsStore().setEnabled(false);
    expect((await trip.reload()).stockEvents.enabled).toBe(false);
  });
});
