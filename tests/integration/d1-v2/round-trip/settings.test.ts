// @vitest-environment happy-dom
/**
 * Round trip for Configuración — audit §4.1 (accounts vanish) and §4.8
 * (investment assets / liabilities are never synced at all).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startRoundTrip, type RoundTrip } from "./harness";

describe("round trip: cuentas, activos y pasivos", () => {
  let trip: RoundTrip;

  beforeEach(async () => {
    trip = await startRoundTrip();
  });

  afterEach(() => {
    trip.cleanup();
  });

  it("an account the user creates is still visible after a reload (§4.1)", async () => {
    const { useSettingsStore } = await import("../../../../src/stores/settings");
    useSettingsStore().addEntity("accounts", "Revolut", "285.67");

    const reloaded = await trip.reload();

    expect(reloaded.accounts).toHaveLength(1);
    expect(reloaded.accounts[0]).toMatchObject({ name: "Revolut", openingBalance: 285.67 });
  });

  it("editing a migrated account does not change what kind of account it is (§4.1)", async () => {
    trip.cleanup();
    trip = await startRoundTrip(async (db, userId) => {
      const accountsRepository = await import("../../../../src/db/repositories/accounts");
      // A row as the v1 migration writes it.
      await accountsRepository.create(db, userId, {
        name: "Santander",
        kind: "cash",
        currency: "EUR",
        openingBalance: 31.09,
        legacyId: "santander",
      });
    });
    await trip.reload();

    const { useSettingsStore } = await import("../../../../src/stores/settings");
    useSettingsStore().updateEntityField("accounts", "santander", "name", "Santander Nómina");

    const reloaded = await trip.reload();

    expect(reloaded.accounts).toHaveLength(1);
    expect(reloaded.accounts[0].name).toBe("Santander Nómina");
  });

  it("an investment asset the user creates survives a reload (§4.8)", async () => {
    const { useSettingsStore } = await import("../../../../src/stores/settings");
    useSettingsStore().addEntity("investmentAssets", "Indexa", "500");

    const reloaded = await trip.reload();

    expect(reloaded.investmentAssets).toHaveLength(1);
  });

  it("a liability the user creates survives a reload (§4.8)", async () => {
    const { useSettingsStore } = await import("../../../../src/stores/settings");
    useSettingsStore().addEntity("liabilities", "Hipoteca", "120000");

    const reloaded = await trip.reload();

    expect(reloaded.liabilities).toHaveLength(1);
  });
});
