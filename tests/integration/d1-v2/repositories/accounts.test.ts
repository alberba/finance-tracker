import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as accountsRepo from "../../../../src/db/repositories/accounts";
import * as transactionsRepo from "../../../../src/db/repositories/transactions";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";
import { runWithDb } from '../../../../src/db/database'

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

    const created = await runWithDb(db, accountsRepo.create(user.id, {
      name: "Cuenta corriente",
      kind: "cash",
      currency: "EUR",
      openingBalance: 12.34,
    }));
    expect(created.openingBalance).toBe(12.34);

    const found = await runWithDb(db, accountsRepo.get(user.id, created.id));
    expect(found?.openingBalance).toBe(12.34);

    const updated = await runWithDb(db, accountsRepo.update(user.id, created.id, { openingBalance: 50 }));
    expect(updated?.openingBalance).toBe(50);
    expect(updated?.version).toBe(2);

    const removed = await runWithDb(db, accountsRepo.remove(user.id, created.id));
    expect(removed).toBe(true);
    expect(await runWithDb(db, accountsRepo.get(user.id, created.id))).toBeUndefined();
  });

  it("rejects creating an account for a non-existent user (FK violation)", async () => {
    const { db } = testDb;
    await expect(
      runWithDb(db, accountsRepo.create("does-not-exist", {
        name: "Huérfana",
        kind: "cash",
        currency: "EUR",
        openingBalance: 0,
      })),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    const accountA = await runWithDb(db, accountsRepo.create(userA.id, {
      name: "Cuenta A",
      kind: "cash",
      currency: "EUR",
      openingBalance: 0,
    }));

    expect(await runWithDb(db, accountsRepo.get(userB.id, accountA.id))).toBeUndefined();
    expect(await runWithDb(db, accountsRepo.listByUser(userB.id))).toHaveLength(0);
    expect(await runWithDb(db, accountsRepo.update(userB.id, accountA.id, { name: "Hackeada" }))).toBeUndefined();
    expect(await runWithDb(db, accountsRepo.remove(userB.id, accountA.id))).toBe(false);
  });

  it("rejects deleting an account still in use instead of a raw FK violation (audit §2.6)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    const account = await runWithDb(db, accountsRepo.create(user.id, {
      name: "Cuenta con movimientos",
      kind: "cash",
      currency: "EUR",
      openingBalance: 0,
    }));
    await transactionsRepo.create(db, user.id, {
      accountId: account.id,
      type: "expense",
      date: "2026-01-15",
      amount: 10,
      currency: "EUR",
    });

    await expect(runWithDb(db, accountsRepo.remove(user.id, account.id))).rejects.toThrow(
      /tiene movimientos u otros datos asociados/i,
    );
    expect(await runWithDb(db, accountsRepo.get(user.id, account.id))).not.toBeUndefined();
  });

  it("bulk inserts accounts for the migration tool", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    const rows = await runWithDb(db, accountsRepo.bulkInsert(user.id, [
      { name: "A", kind: "cash", currency: "EUR", openingBalance: 1 },
      { name: "B", kind: "cash", currency: "USD", openingBalance: 2 },
    ]));
    expect(rows).toHaveLength(2);
    expect(rows[1].currency).toBe("USD");
  });

  describe("categories", () => {
    it("supports CRUD and cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);

      const created = await runWithDb(db, accountsRepo.createCategory(userA.id, {
        name: "Ocio",
        kind: "expense",
      }));
      expect(await runWithDb(db, accountsRepo.getCategory(userB.id, created.id))).toBeUndefined();

      const updated = await runWithDb(db, accountsRepo.updateCategory(userA.id, created.id, { name: "Ocio y viajes" }));
      expect(updated?.name).toBe("Ocio y viajes");

      expect(await runWithDb(db, accountsRepo.removeCategory(userB.id, created.id))).toBe(false);
      expect(await runWithDb(db, accountsRepo.removeCategory(userA.id, created.id))).toBe(true);
    });

    it("rejects creating a category for a non-existent user (FK violation)", async () => {
      const { db } = testDb;
      await expect(
        runWithDb(db, accountsRepo.createCategory("does-not-exist", { name: "x", kind: "expense" })),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    });

    it("rejects deleting a category still in use instead of a raw FK violation (audit §2.6)", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      const account = await runWithDb(db, accountsRepo.create(user.id, {
        name: "Cuenta",
        kind: "cash",
        currency: "EUR",
        openingBalance: 0,
      }));
      const category = await runWithDb(db, accountsRepo.createCategory(user.id, { name: "Ocio", kind: "expense" }));
      await transactionsRepo.create(db, user.id, {
        accountId: account.id,
        categoryId: category.id,
        type: "expense",
        date: "2026-01-15",
        amount: 10,
        currency: "EUR",
      });

      await expect(runWithDb(db, accountsRepo.removeCategory(user.id, category.id))).rejects.toThrow(
        /está en uso/i,
      );
      expect(await runWithDb(db, accountsRepo.getCategory(user.id, category.id))).not.toBeUndefined();
    });
  });

  describe("twr liquidity accounts", () => {
    it("supports CRUD, FK violation, and cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);
      const account = await runWithDb(db, accountsRepo.create(userA.id, {
        name: "Broker",
        kind: "broker",
        currency: "EUR",
        openingBalance: 0,
      }));

      const created = await runWithDb(db, accountsRepo.createTwrLiquidityAccount(userA.id, {
        accountId: account.id,
        name: "Liquidez broker",
      }));
      expect(await runWithDb(db, accountsRepo.getTwrLiquidityAccount(userB.id, created.id))).toBeUndefined();
      expect(await runWithDb(db, accountsRepo.listTwrLiquidityAccountsByUser(userA.id))).toHaveLength(1);
      expect(await runWithDb(db, accountsRepo.removeTwrLiquidityAccount(userA.id, created.id))).toBe(true);

      await expect(
        runWithDb(db, accountsRepo.createTwrLiquidityAccount(userA.id, {
          accountId: "does-not-exist",
          name: "x",
        })),
      ).rejects.toThrow(/no existe o no pertenece/i);
    });
  });
});
