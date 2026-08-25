import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import {
  clearEntityStore,
  getAllEntities,
  getCachedSettings,
  getCachedBootstrap,
  getEntity,
  getRevision,
  openIdbCache,
  putEntities,
  putEntity,
  removeEntity,
  replaceEntities,
  setCachedSettings,
  setCachedBootstrap,
  setRevision,
  wipeIdbCache,
} from "../../src/lib/client/idb-cache";

const USER_ID = "user-idb-cache-test";

describe("idb-cache", () => {
  beforeEach(async () => {
    await wipeIdbCache(USER_ID);
  });

  it("starts empty and with revision 0", async () => {
    const db = await openIdbCache(USER_ID);
    expect(await getAllEntities(db, "account")).toEqual([]);
    expect(await getRevision(db)).toBe(0);
    db.close();
  });

  it("round-trips a single entity", async () => {
    const db = await openIdbCache(USER_ID);
    await putEntity(db, "account", { id: "acc-1", name: "Cuenta corriente" });
    const found = await getEntity(db, "account", "acc-1");
    expect(found).toEqual({ id: "acc-1", name: "Cuenta corriente" });
    db.close();
  });

  it("upserts many entities and lists them all", async () => {
    const db = await openIdbCache(USER_ID);
    await putEntities(db, "category", [
      { id: "cat-1", name: "Ingresos" },
      { id: "cat-2", name: "Gastos" },
    ]);
    const all = await getAllEntities(db, "category");
    expect(all).toHaveLength(2);
    expect(all.map((entity) => entity.id).sort()).toEqual(["cat-1", "cat-2"]);
    db.close();
  });

  it("replaceEntities clears the store before writing", async () => {
    const db = await openIdbCache(USER_ID);
    await putEntities(db, "goal", [{ id: "goal-1", name: "Fondo emergencia" }]);
    await replaceEntities(db, "goal", [{ id: "goal-2", name: "Nuevo objetivo" }]);
    const all = await getAllEntities(db, "goal");
    expect(all).toEqual([{ id: "goal-2", name: "Nuevo objetivo" }]);
    db.close();
  });

  it("removes an entity by id", async () => {
    const db = await openIdbCache(USER_ID);
    await putEntity(db, "transaction", { id: "tx-1", amount: 10 });
    await removeEntity(db, "transaction", "tx-1");
    expect(await getEntity(db, "transaction", "tx-1")).toBeUndefined();
    db.close();
  });

  it("clearEntityStore empties one store without touching others", async () => {
    const db = await openIdbCache(USER_ID);
    await putEntity(db, "account", { id: "acc-1" });
    await putEntity(db, "category", { id: "cat-1" });
    await clearEntityStore(db, "account");
    expect(await getAllEntities(db, "account")).toEqual([]);
    expect(await getAllEntities(db, "category")).toEqual([{ id: "cat-1" }]);
    db.close();
  });

  it("persists the sync revision cursor", async () => {
    const db = await openIdbCache(USER_ID);
    await setRevision(db, 42);
    expect(await getRevision(db)).toBe(42);
    db.close();
  });

  it("persists the cached user_settings singleton", async () => {
    const db = await openIdbCache(USER_ID);
    expect(await getCachedSettings(db)).toBeNull();
    await setCachedSettings(db, { currency: "EUR" });
    expect(await getCachedSettings(db)).toEqual({ currency: "EUR" });
    db.close();
  });

  it("persists the complete bootstrap for offline hydration", async () => {
    const db = await openIdbCache(USER_ID);
    expect(await getCachedBootstrap(db)).toBeNull();
    await setCachedBootstrap(db, { revision: 4, accounts: [{ id: "acc-1" }] });
    expect(await getCachedBootstrap(db)).toEqual({ revision: 4, accounts: [{ id: "acc-1" }] });
    db.close();
  });

  it("wipeIdbCache deletes the whole per-user database", async () => {
    const db = await openIdbCache(USER_ID);
    await putEntity(db, "account", { id: "acc-1" });
    db.close();

    await wipeIdbCache(USER_ID);

    const reopened = await openIdbCache(USER_ID);
    expect(await getAllEntities(reopened, "account")).toEqual([]);
    reopened.close();
  });

  it("scopes storage per user id", async () => {
    const dbA = await openIdbCache(USER_ID);
    const dbB = await openIdbCache(`${USER_ID}-other`);
    await putEntity(dbA, "account", { id: "acc-1" });
    expect(await getAllEntities(dbB, "account")).toEqual([]);
    dbA.close();
    dbB.close();
    await wipeIdbCache(`${USER_ID}-other`);
  });
});
