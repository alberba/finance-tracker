import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as transactionsRepo from "../../../../src/db/repositories/transactions";
import { createTestDb, type TestDatabase } from "../setup";
import { seedAccount, seedUser } from "./fixtures";
import { runWithDb } from '../../../../src/db/database'

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

    const created = await runWithDb(db, transactionsRepo.create(user.id, {
      accountId: account.id,
      type: "expense",
      date: "2026-01-15",
      amount: 19.99,
      currency: "EUR",
    }));
    expect(created.amount).toBe(19.99);

    const found = await runWithDb(db, transactionsRepo.get(user.id, created.id));
    expect(found?.amount).toBe(19.99);

    const updated = await runWithDb(db, transactionsRepo.update(user.id, created.id, { amount: 25 }));
    expect(updated?.amount).toBe(25);

    const removed = await runWithDb(db, transactionsRepo.remove(user.id, created.id));
    expect(removed).toBe(true);
  });

  it("rejects creating a transaction for a non-existent account (WP10 ownership guard, formerly a raw FK violation)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    await expect(
      runWithDb(db, transactionsRepo.create(user.id, {
        accountId: "does-not-exist",
        type: "expense",
        date: "2026-01-15",
        amount: 1,
        currency: "EUR",
      })),
    ).rejects.toThrow(/no existe o no pertenece al usuario/i);
  });

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    const accountA = await seedAccount(db, userA.id);

    const created = await runWithDb(db, transactionsRepo.create(userA.id, {
      accountId: accountA.id,
      type: "expense",
      date: "2026-01-15",
      amount: 1,
      currency: "EUR",
    }));

    expect(await runWithDb(db, transactionsRepo.get(userB.id, created.id))).toBeUndefined();
    expect(await runWithDb(db, transactionsRepo.listByUser(userB.id))).toHaveLength(0);
  });

  it("bulk inserts transactions", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    const account = await seedAccount(db, user.id);
    const rows = await runWithDb(db, transactionsRepo.bulkInsert(user.id, [
      { accountId: account.id, type: "expense", date: "2026-01-01", amount: 10, currency: "EUR" },
      { accountId: account.id, type: "income", date: "2026-01-02", amount: 20, currency: "EUR" },
    ]));
    expect(rows).toHaveLength(2);
  });

  describe("investment trade details", () => {
    it("supports create, FK violation and cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);
      const accountA = await seedAccount(db, userA.id);
      const transaction = await runWithDb(db, transactionsRepo.create(userA.id, {
        accountId: accountA.id,
        type: "investment",
        date: "2026-01-15",
        amount: 100,
        currency: "EUR",
      }));

      const created = await runWithDb(db, transactionsRepo.createTradeDetail(userA.id, {
        transactionId: transaction.id,
        side: "buy",
        quantity: "1.5",
        price: 66.66,
        fee: 1.5,
        currency: "EUR",
      }));
      expect(created.price).toBe(66.66);
      expect(created.quantity).toBe("1.5");

      expect(
        await runWithDb(db, transactionsRepo.getTradeDetailByTransaction(userB.id, transaction.id)),
      ).toBeUndefined();

      await expect(
        runWithDb(db, transactionsRepo.createTradeDetail(userA.id, {
          transactionId: "does-not-exist",
          side: "buy",
          quantity: "1",
          price: 1,
          fee: 0,
          currency: "EUR",
        })),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/i);

      expect(await runWithDb(db, transactionsRepo.removeTradeDetail(userA.id, created.id))).toBe(true);
    });

    it("removing the transaction deletes its trade detail with it instead of a raw FK violation (audit §2.6)", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      const account = await seedAccount(db, user.id);
      const transaction = await runWithDb(db, transactionsRepo.create(user.id, {
        accountId: account.id,
        type: "investment",
        date: "2026-01-15",
        amount: 100,
        currency: "EUR",
      }));
      const detail = await runWithDb(db, transactionsRepo.createTradeDetail(user.id, {
        transactionId: transaction.id,
        side: "buy",
        quantity: "1.5",
        price: 66.66,
        fee: 1.5,
        currency: "EUR",
      }));

      expect(await runWithDb(db, transactionsRepo.remove(user.id, transaction.id))).toBe(true);

      expect(
        await runWithDb(db, transactionsRepo.getTradeDetailByTransaction(user.id, transaction.id)),
      ).toBeUndefined();
      expect(await runWithDb(db, transactionsRepo.removeTradeDetail(user.id, detail.id))).toBe(false);
    });

    it("writes the operation that travels with the movement, and replaces it on an edit", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      const account = await seedAccount(db, user.id);

      const movement = await runWithDb(db, transactionsRepo.create(user.id, {
        accountId: account.id,
        type: "investment",
        date: "2026-09-12",
        amount: -1206.2,
        currency: "EUR",
        time: "10:30",
        declared: false,
        operation: { symbol: "VWCE", side: "buy", units: 10, unitPrice: 120.5, fee: 1.2 },
      }));

      const stored = await runWithDb(db, transactionsRepo.getTradeDetailByTransaction(user.id, movement.id));
      expect(stored).toMatchObject({ symbol: "VWCE", side: "buy", quantity: "10", price: 120.5, fee: 1.2 });
      expect(movement.time).toBe("10:30");

      await runWithDb(db, transactionsRepo.update(user.id, movement.id, {
        operation: { symbol: "VWCE", side: "sell", units: 4, unitPrice: 130, fee: 0.8 },
      }));

      const edited = await runWithDb(db, transactionsRepo.getTradeDetailByTransaction(user.id, movement.id));
      // Replaced in place: an edit must not leave a second operation behind.
      expect(edited).toMatchObject({ side: "sell", quantity: "4", price: 130, fee: 0.8 });
      expect(edited?.id).toBe(stored?.id);
    });

    it("drops the operation when the movement stops being an investment", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      const account = await seedAccount(db, user.id);

      const movement = await runWithDb(db, transactionsRepo.create(user.id, {
        accountId: account.id,
        type: "investment",
        date: "2026-09-12",
        amount: -1206.2,
        currency: "EUR",
        operation: { symbol: "VWCE", side: "buy", units: 10, unitPrice: 120.5, fee: 1.2 },
      }));
      expect(await runWithDb(db, transactionsRepo.getTradeDetailByTransaction(user.id, movement.id))).toBeDefined();

      // The caller says nothing about the operation: turning the movement into
      // a gasto must still drop it, or it would keep títulos it cannot have.
      await runWithDb(db, transactionsRepo.update(user.id, movement.id, { type: "expense" }));

      expect(await runWithDb(db, transactionsRepo.getTradeDetailByTransaction(user.id, movement.id))).toBeUndefined();
    });

    it("drops the operation when the movement is edited with an explicit null", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      const account = await seedAccount(db, user.id);

      const movement = await runWithDb(db, transactionsRepo.create(user.id, {
        accountId: account.id,
        type: "investment",
        date: "2026-09-12",
        amount: -1206.2,
        currency: "EUR",
        operation: { symbol: "VWCE", side: "buy", units: 10, unitPrice: 120.5, fee: 1.2 },
      }));

      await runWithDb(db, transactionsRepo.update(user.id, movement.id, { operation: null }));

      expect(await runWithDb(db, transactionsRepo.getTradeDetailByTransaction(user.id, movement.id))).toBeUndefined();
    });

    it("leaves the stored operation alone when an edit does not mention it", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      const account = await seedAccount(db, user.id);

      const movement = await runWithDb(db, transactionsRepo.create(user.id, {
        accountId: account.id,
        type: "investment",
        date: "2026-09-12",
        amount: -1206.2,
        currency: "EUR",
        operation: { symbol: "VWCE", side: "buy", units: 10, unitPrice: 120.5, fee: 1.2 },
      }));

      // This is what a builder that knows nothing about operations emits.
      await runWithDb(db, transactionsRepo.update(user.id, movement.id, { description: "Compra VWCE" }));

      expect(await runWithDb(db, transactionsRepo.getTradeDetailByTransaction(user.id, movement.id))).toMatchObject({
        symbol: "VWCE",
        quantity: "10",
      });
    });
  });
});
