// @vitest-environment happy-dom
/**
 * Round trip for el primer paso del refactor de identidad (ADR 0001,
 * expandir): el servidor acepta que la identidad de una entidad nueva la
 * fije el cliente, y la correlación por identificador derivado de los datos
 * sigue viva para las filas migradas de v1 (audit §4.4, §4.6, §4.7).
 */

import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { accounts, categories, subscriptions } from "../../../../src/db/schema";
import { startRoundTrip, type RoundTrip } from "./harness";

describe("round trip: identidad propia para entidades nuevas", () => {
  let trip: RoundTrip;

  beforeEach(async () => {
    trip = await startRoundTrip();
  });

  afterEach(() => {
    trip.cleanup();
  });

  it("almacena la entidad con la identidad que fijó el cliente", async () => {
    const id = crypto.randomUUID();

    await trip.asOtherDevice([
      {
        commandId: crypto.randomUUID(),
        action: "create",
        entityType: "account",
        data: { id, name: "Revolut", kind: "cash", currency: "EUR", openingBalance: 285.67 },
      },
    ]);

    const rows = await trip.testDb.db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, trip.userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);

    const reloaded = await trip.reload();
    expect(reloaded.accounts).toHaveLength(1);
    expect(reloaded.accounts[0]).toMatchObject({ name: "Revolut", openingBalance: 285.67 });
  });

  it("el create y los update posteriores comparten la identidad desde el primer instante", async () => {
    const id = crypto.randomUUID();

    await trip.asOtherDevice([
      {
        commandId: crypto.randomUUID(),
        action: "create",
        entityType: "account",
        data: { id, name: "Santander", kind: "cash", currency: "EUR", openingBalance: 31.09 },
      },
      // Sin tabla de equivalencias y sin esperar al ack: el `update` va
      // dirigido a la misma identidad que el cliente fijó al crear.
      {
        commandId: crypto.randomUUID(),
        action: "update",
        entityType: "account",
        entityId: id,
        baseVersion: 1,
        patch: { name: "Santander Nómina" },
      },
    ]);

    const rows = await trip.testDb.db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, trip.userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].name).toBe("Santander Nómina");

    const reloaded = await trip.reload();
    expect(reloaded.accounts).toHaveLength(1);
    expect(reloaded.accounts[0].name).toBe("Santander Nómina");
  });

  it("reenviar el mismo create es un no-op, no un duplicado", async () => {
    const id = crypto.randomUUID();
    const data = {
      id,
      name: "Netflix",
      categoryId: null,
      accountId: null,
      amount: 12.99,
      currency: "EUR",
      frequency: "monthly",
      // A subscription's start date and next charge are required columns
      // (issue #150); the client always sends both.
      startDate: "2026-01-01",
      nextChargeDate: "2026-02-01",
    };

    await trip.asOtherDevice([
      { commandId: crypto.randomUUID(), action: "create", entityType: "subscription", data },
    ]);
    // Un reenvío tras vaciar la cola local llega con otro commandId, así que
    // la idempotencia por `sync_commands.id` no lo cubre: la identidad la da
    // el cliente, y esa es la que no puede duplicarse.
    await trip.asOtherDevice([
      { commandId: crypto.randomUUID(), action: "create", entityType: "subscription", data },
    ]);

    const rows = await trip.testDb.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, trip.userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
  });

  it("la identidad del cliente convive con la correlación por identificador derivado", async () => {
    trip.cleanup();
    trip = await startRoundTrip(async (db, userId) => {
      const accountsRepository = await import("../../../../src/db/repositories/accounts");
      // Una fila como la escribe la migración de v1: sin identidad propia,
      // reconciliable sólo por su identificador derivado de los datos.
      await accountsRepository.createCategory(db, userId, {
        name: "Comida",
        kind: "expense",
        legacyId: "expense:Comida",
      });
    });

    // El cliente que todavía no ha migrado esta sección reenvía su `create`
    // derivado: sigue siendo un no-op contra la fila migrada.
    await trip.asOtherDevice([
      {
        commandId: crypto.randomUUID(),
        action: "create",
        entityType: "category",
        data: { name: "Comida", kind: "expense", legacyId: "expense:Comida" },
      },
    ]);

    const rows = await trip.testDb.db
      .select()
      .from(categories)
      .where(and(eq(categories.userId, trip.userId), eq(categories.legacyId, "expense:Comida")));
    expect(rows).toHaveLength(1);
  });

  // -- contraer: el camino de escritura deja de correlacionar por datos ----

  it("una entidad nueva se almacena con la identidad que le dio el cliente, no con una derivada de sus datos", async () => {
    const { useSettingsStore } = await import("../../../../src/stores/settings");
    const { useFinancialStateStore } = await import("../../../../src/stores/financial-state");

    useSettingsStore().addEntity("accounts", "Revolut", "285.67");
    const accountId = useFinancialStateStore().accounts[0].id;

    await trip.reload();

    const rows = await trip.testDb.db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, trip.userId));
    expect(rows).toHaveLength(1);
    // La identidad es la que fijó el cliente, y nada la ata a su nombre: no
    // queda ningún identificador derivado de los datos con el que
    // correlacionarla.
    expect(rows[0].id).toBe(accountId);
    expect(rows[0].legacyId).toBeNull();
  });

  it("renombrar una cuenta nueva conserva su identidad y su fila", async () => {
    const { useSettingsStore } = await import("../../../../src/stores/settings");
    const { useFinancialStateStore } = await import("../../../../src/stores/financial-state");
    const settings = useSettingsStore();

    settings.addEntity("accounts", "Revolut", "0");
    const accountId = useFinancialStateStore().accounts[0].id;
    await trip.reload();

    useSettingsStore().updateEntityField("accounts", accountId, "name", "Revolut Nómina");
    const reloaded = await trip.reload();

    const rows = await trip.testDb.db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, trip.userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(accountId);
    expect(rows[0].name).toBe("Revolut Nómina");
    expect(reloaded.accounts).toHaveLength(1);
    expect(reloaded.accounts[0]).toMatchObject({ name: "Revolut Nómina" });
  });

  it("una categoría nueva lleva identidad propia en vez de una derivada de su nombre", async () => {
    const { useSettingsStore } = await import("../../../../src/stores/settings");

    useSettingsStore().addCategory("expenseCategories", "Ocio");
    await trip.reload();

    const rows = await trip.testDb.db
      .select()
      .from(categories)
      .where(and(eq(categories.userId, trip.userId), eq(categories.name, "Ocio")));
    expect(rows).toHaveLength(1);
    expect(rows[0].legacyId).toBeNull();
  });
});
