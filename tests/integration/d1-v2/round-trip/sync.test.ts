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
    const { useFinancialStateStore } = await import("../../../../src/stores/financial-state");
    useSettingsStore().addEntity("accounts", "Revolut", "0");
    // The account's own identity (ADR 0001) — read from the state rather than
    // assumed from its name, now that a new entity is no longer identified by
    // one derived from its data.
    const accountId = useFinancialStateStore().accounts[0].id;
    await trip.reload();
    const before = await trip.syncStore.getEntityRef("account", accountId);
    expect(before).not.toBeNull();

    trip.setOffline(true);
    await trip.reboot().catch(() => undefined);
    trip.setOffline(false);

    // A transient 500 must not cost this device its cache: without the ref,
    // the next edit becomes a duplicate `create`.
    expect(await trip.syncStore.getEntityRef("account", accountId)).toEqual(before);
  });

  it("still shows work that is queued but not yet sent, after a reload (§5.4)", async () => {
    const { useSettingsStore } = await import("../../../../src/stores/settings");
    trip.setOffline(true);
    useSettingsStore().addEntity("accounts", "Sin conexión", "42");

    const reloaded = await trip.reloadOffline();

    expect(reloaded.accounts.map((account) => account.name)).toContain("Sin conexión");
  });

  it("resolves a same-row conflict on its own: no dialog, the queue keeps flowing, and the user gets a discreet notice (ADR 0003, audit §2.4)", async () => {
    const toast = document.createElement("div");
    toast.id = "toast";
    document.body.append(toast);

    const { useSettingsStore } = await import("../../../../src/stores/settings");
    const { useFinancialStateStore } = await import("../../../../src/stores/financial-state");
    const settingsStore = useSettingsStore();
    settingsStore.addEntity("accounts", "Cuenta con prisa", "0");
    const accountId = useFinancialStateStore().accounts[0].id;
    await trip.reload();

    // Two edits to the same row, queued back to back while offline: both
    // read the same cached version, so whichever one the server applies
    // first bumps the version out from under the other — a same-device
    // conflict, no second device needed (audit §2.4's exact repro).
    trip.setOffline(true);
    settingsStore.updateEntityField("accounts", accountId, "openingBalance", "10");
    settingsStore.updateEntityField("accounts", accountId, "openingBalance", "20");
    // An unrelated change, queued alongside — the conflict on the row above
    // must not freeze it behind the conflicted commands.
    settingsStore.addEntity("accounts", "Cuenta ajena", "5");
    trip.setOffline(false);

    const state = await trip.reload();

    // Nothing is left parked waiting on a manual choice.
    expect(await trip.pending()).toHaveLength(0);
    // The later edit is the one the user actually made last, reapplied over
    // whatever version the earlier one left on the server.
    expect(state.accounts.find((account) => account.id === accountId)?.openingBalance).toBe(20);
    // The unrelated command sent alongside the conflict still went through.
    expect(state.accounts.map((account) => account.name)).toContain("Cuenta ajena");
    // The retry was silent — no modal — but not invisible.
    expect(toast.textContent).toContain("se reaplicó sobre la versión más reciente");

    toast.remove();
  });
});
