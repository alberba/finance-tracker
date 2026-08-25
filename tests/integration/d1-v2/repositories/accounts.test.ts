import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as accountsRepo from "../../../../src/db/repositories/accounts";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";

describe("accounts repository", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("creates, reads, updates and deletes an account (CRUD) with money conversion at the boundary", async () => {
    const { db } = testDb;
    const user = await seedUser(db);

    const created = await accountsRepo.create(db, user.id, {
      name: "Cuenta corriente",
      kind: "cash",
      currency: "EUR",
      openingBalance: 12.34,
    });
    expect(created.openingBalance).toBe(12.34);

    const found = await accountsRepo.get(db, user.id, created.id);
    expect(found?.openingBalance).toBe(12.34);

    const updated = await accountsRepo.update(db, user.id, created.id, { openingBalance: 50 });
    expect(updated?.openingBalance).toBe(50);
    expect(updated?.version).toBe(2);

    const removed = await accountsRepo.remove(db, user.id, created.id);
    expect(removed).toBe(true);
    expect(await accountsRepo.get(db, user.id, created.id)).toBeUndefined();
  });

  it("rejects creating an account for a non-existent user (FK violation)", async () => {
    const { db } = testDb;
    await expect(
      accountsRepo.create(db, "does-not-exist", {
        name: "Huérfana",
        kind: "cash",
        currency: "EUR",
        openingBalance: 0,
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    const accountA = await accountsRepo.create(db, userA.id, {
      name: "Cuenta A",
      kind: "cash",
      currency: "EUR",
      openingBalance: 0,
    });

    expect(await accountsRepo.get(db, userB.id, accountA.id)).toBeUndefined();
    expect(await accountsRepo.listByUser(db, userB.id)).toHaveLength(0);
    expect(await accountsRepo.update(db, userB.id, accountA.id, { name: "Hackeada" })).toBeUndefined();
    expect(await accountsRepo.remove(db, userB.id, accountA.id)).toBe(false);
  });

  it("bulk inserts accounts for the migration tool", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    const rows = await accountsRepo.bulkInsert(db, user.id, [
      { name: "A", kind: "cash", currency: "EUR", openingBalance: 1 },
      { name: "B", kind: "cash", currency: "USD", openingBalance: 2 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1].currency).toBe("USD");
  });

  describe("categories", () => {
    it("supports CRUD and cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);

      const created = await accountsRepo.createCategory(db, userA.id, {
        name: "Ocio",
        kind: "expense",
      });
      expect(await accountsRepo.getCategory(db, userB.id, created.id)).toBeUndefined();

      const updated = await accountsRepo.updateCategory(db, userA.id, created.id, { name: "Ocio y viajes" });
      expect(updated?.name).toBe("Ocio y viajes");

      expect(await accountsRepo.removeCategory(db, userB.id, created.id)).toBe(false);
      expect(await accountsRepo.removeCategory(db, userA.id, created.id)).toBe(true);
    });

    it("rejects creating a category for a non-existent user (FK violation)", async () => {
      const { db } = testDb;
      await expect(
        accountsRepo.createCategory(db, "does-not-exist", { name: "x", kind: "expense" }),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    });
  });

  describe("twr liquidity accounts", () => {
    it("supports CRUD, FK violation, and cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);
      const account = await accountsRepo.create(db, userA.id, {
        name: "Broker",
        kind: "broker",
        currency: "EUR",
        openingBalance: 0,
      });

      const created = await accountsRepo.createTwrLiquidityAccount(db, userA.id, {
        accountId: account.id,
        name: "Liquidez broker",
      });
      expect(await accountsRepo.getTwrLiquidityAccount(db, userB.id, created.id)).toBeUndefined();
      expect(await accountsRepo.listTwrLiquidityAccountsByUser(db, userA.id)).toHaveLength(1);
      expect(await accountsRepo.removeTwrLiquidityAccount(db, userA.id, created.id)).toBe(true);

      await expect(
        accountsRepo.createTwrLiquidityAccount(db, userA.id, {
          accountId: "does-not-exist",
          name: "x",
        }),
      ).rejects.toThrow(/no existe o no pertenece/i);
    });
  });
});
