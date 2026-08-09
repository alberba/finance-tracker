import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as transactionsRepo from "../../../../src/db/repositories/transactions";
import { createTestDb, type TestDatabase } from "../setup";
import { seedAccount, seedUser } from "./fixtures";

describe("transactions repository", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("creates, reads, updates and deletes a transaction (CRUD)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    const account = await seedAccount(db, user.id);

    const created = await transactionsRepo.create(db, user.id, {
      accountId: account.id,
      type: "expense",
      date: "2026-01-15",
      amount: 19.99,
      currency: "EUR",
    });
    expect(created.amount).toBe(19.99);

    const found = await transactionsRepo.get(db, user.id, created.id);
    expect(found?.amount).toBe(19.99);

    const updated = await transactionsRepo.update(db, user.id, created.id, { amount: 25 });
    expect(updated?.amount).toBe(25);

    const removed = await transactionsRepo.remove(db, user.id, created.id);
    expect(removed).toBe(true);
  });

  it("rejects creating a transaction for a non-existent account (WP10 ownership guard, formerly a raw FK violation)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    await expect(
      transactionsRepo.create(db, user.id, {
        accountId: "does-not-exist",
        type: "expense",
        date: "2026-01-15",
        amount: 1,
        currency: "EUR",
      }),
    ).rejects.toThrow(/no existe o no pertenece al usuario/i);
  });

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    const accountA = await seedAccount(db, userA.id);

    const created = await transactionsRepo.create(db, userA.id, {
      accountId: accountA.id,
      type: "expense",
      date: "2026-01-15",
      amount: 1,
      currency: "EUR",
    });

    expect(await transactionsRepo.get(db, userB.id, created.id)).toBeUndefined();
    expect(await transactionsRepo.listByUser(db, userB.id)).toHaveLength(0);
  });

  it("bulk inserts transactions", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    const account = await seedAccount(db, user.id);
    const rows = await transactionsRepo.bulkInsert(db, user.id, [
      { accountId: account.id, type: "expense", date: "2026-01-01", amount: 10, currency: "EUR" },
      { accountId: account.id, type: "income", date: "2026-01-02", amount: 20, currency: "EUR" },
    ]);
    expect(rows).toHaveLength(2);
  });

  describe("investment trade details", () => {
    it("supports create, FK violation and cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);
      const accountA = await seedAccount(db, userA.id);
      const transaction = await transactionsRepo.create(db, userA.id, {
        accountId: accountA.id,
        type: "investment",
        date: "2026-01-15",
        amount: 100,
        currency: "EUR",
      });

      const created = await transactionsRepo.createTradeDetail(db, userA.id, {
        transactionId: transaction.id,
        side: "buy",
        quantity: "1.5",
        price: 66.66,
        fee: 1.5,
        currency: "EUR",
      });
      expect(created.price).toBe(66.66);
      expect(created.quantity).toBe("1.5");

      expect(
        await transactionsRepo.getTradeDetailByTransaction(db, userB.id, transaction.id),
      ).toBeUndefined();

      await expect(
        transactionsRepo.createTradeDetail(db, userA.id, {
          transactionId: "does-not-exist",
          side: "buy",
          quantity: "1",
          price: 1,
          fee: 0,
          currency: "EUR",
        }),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

      expect(await transactionsRepo.removeTradeDetail(db, userA.id, created.id)).toBe(true);
    });
  });
});
