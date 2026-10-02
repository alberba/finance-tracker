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

    it("removing the transaction deletes its trade detail with it instead of a raw FK violation (audit §2.6)", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      const account = await seedAccount(db, user.id);
      const transaction = await transactionsRepo.create(db, user.id, {
        accountId: account.id,
        type: "investment",
        date: "2026-01-15",
        amount: 100,
        currency: "EUR",
      });
      const detail = await transactionsRepo.createTradeDetail(db, user.id, {
        transactionId: transaction.id,
        side: "buy",
        quantity: "1.5",
        price: 66.66,
        fee: 1.5,
        currency: "EUR",
      });

      expect(await transactionsRepo.remove(db, user.id, transaction.id)).toBe(true);

      expect(
        await transactionsRepo.getTradeDetailByTransaction(db, user.id, transaction.id),
      ).toBeUndefined();
      expect(await transactionsRepo.removeTradeDetail(db, user.id, detail.id)).toBe(false);
    });

    it("writes the operation that travels with the movement, and replaces it on an edit", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      const account = await seedAccount(db, user.id);

      const movement = await transactionsRepo.create(db, user.id, {
        accountId: account.id,
        type: "investment",
        date: "2026-09-12",
        amount: -1206.2,
        currency: "EUR",
        time: "10:30",
        declared: false,
        operation: { symbol: "VWCE", side: "buy", units: 10, unitPrice: 120.5, fee: 1.2 },
      });

      const stored = await transactionsRepo.getTradeDetailByTransaction(db, user.id, movement.id);
      expect(stored).toMatchObject({ symbol: "VWCE", side: "buy", quantity: "10", price: 120.5, fee: 1.2 });
      expect(movement.time).toBe("10:30");

      await transactionsRepo.update(db, user.id, movement.id, {
        operation: { symbol: "VWCE", side: "sell", units: 4, unitPrice: 130, fee: 0.8 },
      });

      const edited = await transactionsRepo.getTradeDetailByTransaction(db, user.id, movement.id);
      // Replaced in place: an edit must not leave a second operation behind.
      expect(edited).toMatchObject({ side: "sell", quantity: "4", price: 130, fee: 0.8 });
      expect(edited?.id).toBe(stored?.id);
    });

    it("drops the operation when the movement stops being an investment", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      const account = await seedAccount(db, user.id);

      const movement = await transactionsRepo.create(db, user.id, {
        accountId: account.id,
        type: "investment",
        date: "2026-09-12",
        amount: -1206.2,
        currency: "EUR",
        operation: { symbol: "VWCE", side: "buy", units: 10, unitPrice: 120.5, fee: 1.2 },
      });
      expect(await transactionsRepo.getTradeDetailByTransaction(db, user.id, movement.id)).toBeDefined();

      // The caller says nothing about the operation: turning the movement into
      // a gasto must still drop it, or it would keep títulos it cannot have.
      await transactionsRepo.update(db, user.id, movement.id, { type: "expense" });

      expect(await transactionsRepo.getTradeDetailByTransaction(db, user.id, movement.id)).toBeUndefined();
    });

    it("drops the operation when the movement is edited with an explicit null", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      const account = await seedAccount(db, user.id);

      const movement = await transactionsRepo.create(db, user.id, {
        accountId: account.id,
        type: "investment",
        date: "2026-09-12",
        amount: -1206.2,
        currency: "EUR",
        operation: { symbol: "VWCE", side: "buy", units: 10, unitPrice: 120.5, fee: 1.2 },
      });

      await transactionsRepo.update(db, user.id, movement.id, { operation: null });

      expect(await transactionsRepo.getTradeDetailByTransaction(db, user.id, movement.id)).toBeUndefined();
    });

    it("leaves the stored operation alone when an edit does not mention it", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      const account = await seedAccount(db, user.id);

      const movement = await transactionsRepo.create(db, user.id, {
        accountId: account.id,
        type: "investment",
        date: "2026-09-12",
        amount: -1206.2,
        currency: "EUR",
        operation: { symbol: "VWCE", side: "buy", units: 10, unitPrice: 120.5, fee: 1.2 },
      });

      // This is what a builder that knows nothing about operations emits.
      await transactionsRepo.update(db, user.id, movement.id, { description: "Compra VWCE" });

      expect(await transactionsRepo.getTradeDetailByTransaction(db, user.id, movement.id)).toMatchObject({
        symbol: "VWCE",
        quantity: "10",
      });
    });
  });
});
