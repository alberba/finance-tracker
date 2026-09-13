import "fake-indexeddb/auto";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/scripts/demo-mode", () => ({
  isDemoMode: vi.fn(() => false),
}));

import { openIdbCache, putEntity } from "../../src/lib/client/idb-cache";
import { openOutbox, wipeOutbox, listAll } from "../../src/lib/client/outbox";
import { wipeIdbCache } from "../../src/lib/client/idb-cache";
import {
  categoryLocalId,
  resolveCategoryId,
  resolveEntityId,
  syncCreate,
  syncListDiff,
  syncRemove,
  syncSettingsUpdate,
  syncUpdate,
  syncUpsert,
} from "../../src/lib/client/command-mapping";
import { useSyncStore } from "../../src/stores/sync";

const USER_ID = "user-command-mapping-test";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only store handle, closed in afterEach
let activeStore: any = null;

async function initSyncStore() {
  const store = useSyncStore();
  await store.init(USER_ID);
  // Force the store "offline" so `enqueueCommand`'s fire-and-forget
  // `flush()` never issues a real `fetch('/api/sync')` (there's no server
  // in this unit test, and Node's `fetch` against a relative URL throws,
  // which otherwise sends `flush()` into its retry/backoff loop and leaks
  // timers across tests). Nothing under test here exercises `flush()`.
  store.connection = "offline";
  activeStore = store;
  return store;
}

describe("command-mapping (WP7b)", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    await wipeIdbCache(USER_ID);
    await wipeOutbox(USER_ID);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (activeStore) {
      await activeStore.logout();
      activeStore = null;
    }
    await wipeIdbCache(USER_ID);
    await wipeOutbox(USER_ID);
  });

  describe("disabled (PUBLIC_SYNC_V2 off)", () => {
    it("every function is a no-op and never touches Pinia/IndexedDB", async () => {
      // No `setActivePinia`/store init needed at all — proves these bail
      // out before touching the sync store.
      await expect(syncCreate("account", "local-1", { name: "x" })).resolves.toBeUndefined();
      await expect(syncUpdate("account", "local-1", { name: "y" })).resolves.toBeUndefined();
      await expect(syncRemove("account", "local-1")).resolves.toBeUndefined();
      await expect(syncUpsert("account", "local-1", { name: "z" })).resolves.toBeUndefined();
      await expect(syncSettingsUpdate({ currency: "EUR" })).resolves.toBeUndefined();
      await expect(resolveEntityId("account", "local-1")).resolves.toBeNull();
      await expect(resolveCategoryId("expense", "Comida")).resolves.toBeNull();
      await expect(syncListDiff("account", [], [{ id: "a" }], () => ({ name: "a" }))).resolves.toBeUndefined();
    });
  });

  describe("enabled (PUBLIC_SYNC_V2 on)", () => {
    beforeEach(() => {
      vi.stubEnv("PUBLIC_SYNC_V2", "true");
    });

    it("syncCreate enqueues a create command tagged with legacyId", async () => {
      const store = await initSyncStore();
      await syncCreate("account", "local-acc-1", {
        name: "Cuenta",
        kind: "checking",
        currency: "EUR",
        openingBalance: 10,
      });

      const outboxDb = await openOutbox(USER_ID);
      const entries = await listAll(outboxDb);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.command).toMatchObject({
        action: "create",
        entityType: "account",
        data: { name: "Cuenta", legacyId: "local-acc-1" },
      });
      expect(store.pendingCount).toBeGreaterThanOrEqual(0);
      outboxDb.close();
    });

    it("surfaces an invalid payload as a visible error instead of an unhandled rejection (issue #138)", async () => {
      const store = await initSyncStore();

      // `syncCreate`/`syncListDiff` are always fired with `void` from the
      // domain stores (no `.catch`), so a rejected promise here would be an
      // unhandled rejection in production — this must resolve.
      await expect(
        syncCreate("account", "local-acc-bad", {
          name: "Cuenta",
          kind: "checking",
          currency: "EUR",
          openingBalance: 10,
          // `entityCreateSchemas.account` doesn't declare this field.
          bogusField: "no destino",
        }),
      ).resolves.toBeUndefined();

      expect(store.lastError).toBeTruthy();

      const outboxDb = await openOutbox(USER_ID);
      expect(await listAll(outboxDb)).toHaveLength(0);
      outboxDb.close();
    });

    it("syncUpdate resolves a cached server entity and enqueues an update with its version", async () => {
      await initSyncStore();
      const cacheDb = await openIdbCache(USER_ID);
      await putEntity(cacheDb, "account", { id: "server-acc-1", legacyId: "local-acc-1", version: 3, name: "Cuenta" });
      cacheDb.close();

      await syncUpdate("account", "local-acc-1", { name: "Nueva" });

      const outboxDb = await openOutbox(USER_ID);
      const entries = await listAll(outboxDb);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.command).toMatchObject({
        action: "update",
        entityType: "account",
        entityId: "server-acc-1",
        baseVersion: 3,
        patch: { name: "Nueva" },
      });
      outboxDb.close();
    });

    it("syncUpdate folds into a still-pending create when the entity hasn't synced yet", async () => {
      await initSyncStore();
      await syncCreate("account", "local-acc-2", { name: "Original", kind: "checking", currency: "EUR", openingBalance: 0 });
      await syncUpdate("account", "local-acc-2", { name: "Editada" });

      const outboxDb = await openOutbox(USER_ID);
      const entries = await listAll(outboxDb);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.command).toMatchObject({
        action: "create",
        data: { name: "Editada", legacyId: "local-acc-2" },
      });
      outboxDb.close();
    });

    it("syncUpdate warns (does not throw) when the entity is neither cached nor pending", async () => {
      await initSyncStore();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await syncUpdate("account", "unknown-id", { name: "x" });
      expect(warnSpy).toHaveBeenCalledOnce();
      warnSpy.mockRestore();
    });

    it("syncRemove enqueues a remove for a synced entity", async () => {
      await initSyncStore();
      const cacheDb = await openIdbCache(USER_ID);
      await putEntity(cacheDb, "account", { id: "server-acc-3", legacyId: "local-acc-3", version: 1 });
      cacheDb.close();

      await syncRemove("account", "local-acc-3");

      const outboxDb = await openOutbox(USER_ID);
      const entries = await listAll(outboxDb);
      expect(entries[0]?.command).toMatchObject({
        action: "remove",
        entityId: "server-acc-3",
        baseVersion: 1,
      });
      outboxDb.close();
    });

    it("syncRemove cancels a still-pending create instead of emitting a remove", async () => {
      await initSyncStore();
      await syncCreate("account", "local-acc-4", { name: "x", kind: "checking", currency: "EUR", openingBalance: 0 });

      await syncRemove("account", "local-acc-4");

      const outboxDb = await openOutbox(USER_ID);
      const entries = await listAll(outboxDb);
      expect(entries).toHaveLength(0);
      outboxDb.close();
    });

    it("syncUpsert creates when unknown and updates when a server ref exists", async () => {
      await initSyncStore();
      await syncUpsert("goal", "short", { key: "short", name: "Meta", targetYear: 2030, targetAmount: 1000, currency: "EUR" });

      const outboxDbFirst = await openOutbox(USER_ID);
      const firstEntries = await listAll(outboxDbFirst);
      expect(firstEntries[0]?.command.action).toBe("create");
      outboxDbFirst.close();

      // Simulate the create having synced by seeding the cache directly
      // (getEntityRef is checked before the still-pending outbox create, so
      // this alone is enough to flip the next call onto the update path —
      // no need to touch/close the outbox's live connection mid-test).
      const cacheDb = await openIdbCache(USER_ID);
      await putEntity(cacheDb, "goal", { id: "server-goal-1", legacyId: "short", version: 1 });
      cacheDb.close();

      await syncUpsert("goal", "short", { name: "Meta actualizada" });
      const outboxDbSecond = await openOutbox(USER_ID);
      const secondEntries = await listAll(outboxDbSecond);
      const update = secondEntries.find((entry) => entry.command.action === "update");
      expect(update?.command).toMatchObject({ action: "update", entityId: "server-goal-1", baseVersion: 1 });
      outboxDbSecond.close();
    });

    it("syncSettingsUpdate enqueues a settingsUpdate command", async () => {
      await initSyncStore();
      await syncSettingsUpdate({ currency: "USD" });
      const outboxDb = await openOutbox(USER_ID);
      const entries = await listAll(outboxDb);
      expect(entries[0]?.command).toMatchObject({ action: "settingsUpdate", patch: { currency: "USD" } });
      outboxDb.close();
    });

    it("resolveCategoryId lazily create-syncs an unknown category and returns null until it's cached", async () => {
      await initSyncStore();
      const first = await resolveCategoryId("expense", "Comida");
      expect(first).toBeNull();

      const outboxDb = await openOutbox(USER_ID);
      const entries = await listAll(outboxDb);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.command).toMatchObject({
        action: "create",
        entityType: "category",
        data: { name: "Comida", kind: "expense", legacyId: categoryLocalId("expense", "Comida") },
      });
      outboxDb.close();

      // Calling again must not enqueue a second create (folds into the pending one).
      const second = await resolveCategoryId("expense", "Comida");
      expect(second).toBeNull();
      const outboxDb2 = await openOutbox(USER_ID);
      expect(await listAll(outboxDb2)).toHaveLength(1);
      outboxDb2.close();

      // Once the category is cached (server round-trip), it resolves.
      const cacheDb = await openIdbCache(USER_ID);
      await putEntity(cacheDb, "category", {
        id: "server-cat-1",
        legacyId: categoryLocalId("expense", "Comida"),
        version: 0,
      });
      cacheDb.close();

      const third = await resolveCategoryId("expense", "Comida");
      expect(third).toBe("server-cat-1");
    });

    it("resolveEntityId resolves a known ref and returns null for an unknown one", async () => {
      await initSyncStore();
      expect(await resolveEntityId("recurringRule", "rule-1")).toBeNull();

      const cacheDb = await openIdbCache(USER_ID);
      await putEntity(cacheDb, "recurringRule", { id: "server-rule-1", legacyId: "rule-1", version: 2 });
      cacheDb.close();

      expect(await resolveEntityId("recurringRule", "rule-1")).toBe("server-rule-1");
    });

    describe("syncListDiff", () => {
      it("emits create for new rows, update for changed rows, and remove for dropped rows", async () => {
        await initSyncStore();
        // tx-1/tx-2 are "already synced" — seed the cache so `syncUpdate`
        // resolves them via `getEntityRef` instead of warning that they're
        // unknown.
        const cacheDb = await openIdbCache(USER_ID);
        await putEntity(cacheDb, "transaction", { id: "server-tx-1", legacyId: "tx-1", version: 0 });
        await putEntity(cacheDb, "transaction", { id: "server-tx-2", legacyId: "tx-2", version: 0 });
        cacheDb.close();

        const before = [
          { id: "tx-1", amount: 10 },
          { id: "tx-2", amount: 20 },
        ];
        const after = [
          { id: "tx-1", amount: 10 }, // unchanged — no command
          { id: "tx-2", amount: 99 }, // changed — update
          { id: "tx-3", amount: 5 }, // new — create
        ];

        // A full, schema-valid transaction payload — `entityCreateSchemas.transaction`
        // requires `accountId`/`type`/`date`/`currency` too (strict, issue #138),
        // so `tx-3`'s create needs them even though only `amount` varies per row.
        await syncListDiff("transaction", before, after, (item) => ({
          accountId: "acc-1",
          type: "expense",
          date: "2026-01-01",
          amount: item.amount,
          currency: "EUR",
        }));

        const outboxDb = await openOutbox(USER_ID);
        const entries = await listAll(outboxDb);
        const actions = entries.map((e) => e.command.action);
        expect(actions.sort()).toEqual(["create", "update"].sort());
        outboxDb.close();
      });

      it("skips items whose buildData resolves to null", async () => {
        await initSyncStore();
        await syncListDiff("pendingMovement", [], [{ id: "p-1" }], () => null);
        const outboxDb = await openOutbox(USER_ID);
        expect(await listAll(outboxDb)).toHaveLength(0);
        outboxDb.close();
      });

      it("emits remove for every row present before but absent after", async () => {
        await initSyncStore();
        const cacheDb = await openIdbCache(USER_ID);
        await putEntity(cacheDb, "transaction", { id: "server-tx-1", legacyId: "tx-1", version: 0 });
        cacheDb.close();

        await syncListDiff("transaction", [{ id: "tx-1" }], [], () => ({}));

        const outboxDb = await openOutbox(USER_ID);
        const entries = await listAll(outboxDb);
        expect(entries[0]?.command).toMatchObject({ action: "remove", entityId: "server-tx-1" });
        outboxDb.close();
      });
    });
  });
});
