// @vitest-environment happy-dom
/**
 * Round trip for the sync loop itself — audit §5.2 (a failed bootstrap wipes
 * the local cache and resets the cursor), §5.3 (acking a batch advances the
 * cursor past changes this device never applied) and §5.4 (queued-but-unsent
 * work disappears from the UI on reload).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startRoundTrip, type RoundTrip } from "./harness";

describe("round trip: sincronización", () => {
  let trip: RoundTrip;

  beforeEach(async () => {
    trip = await startRoundTrip();
  });

  afterEach(() => {
    trip.cleanup();
  });

  it("does not skip changes made on another device when flushing its own (§5.3)", async () => {
    // Another device creates an account; this one never pulls it...
    await trip.asOtherDevice([
      {
        commandId: crypto.randomUUID(),
        action: "create",
        entityType: "account",
        data: { name: "Desde el móvil", kind: "cash", currency: "EUR", openingBalance: 10, legacyId: "movil" },
      },
    ]);

    // ...and instead pushes work of its own, which acks with the *global*
    // revision — the moment the cursor can jump over what it hasn't seen.
    const { useSettingsStore } = await import("../../../../src/stores/settings");
    useSettingsStore().addEntity("accounts", "Portátil", "0");
    await trip.reload();

    expect(await trip.syncStore.getEntityRef("account", "movil")).not.toBeNull();
  });

  it("keeps the local cache when the bootstrap request fails (§5.2)", async () => {
    const { useSettingsStore } = await import("../../../../src/stores/settings");
    useSettingsStore().addEntity("accounts", "Revolut", "0");
    await trip.reload();
    const before = await trip.syncStore.getEntityRef("account", "revolut");
    expect(before).not.toBeNull();

    trip.setOffline(true);
    await trip.reboot().catch(() => undefined);
    trip.setOffline(false);

    // A transient 500 must not cost this device its cache: without the ref,
    // the next edit becomes a duplicate `create`.
    expect(await trip.syncStore.getEntityRef("account", "revolut")).toEqual(before);
  });

  it("still shows work that is queued but not yet sent, after a reload (§5.4)", async () => {
    const { useSettingsStore } = await import("../../../../src/stores/settings");
    trip.setOffline(true);
    useSettingsStore().addEntity("accounts", "Sin conexión", "42");

    const reloaded = await trip.reloadOffline();

    expect(reloaded.accounts.map((account) => account.name)).toContain("Sin conexión");
  });
});
