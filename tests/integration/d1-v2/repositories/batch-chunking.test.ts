import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as transactionsRepo from "../../../../src/db/repositories/transactions";
import { createTestDb, type TestDatabase } from "../setup";
import { seedAccount, seedUser } from "./fixtures";

/**
 * FINANCE-TRACKER-7: the batch loaders used to pass every id of a dataset to a
 * single `inArray(...)`, which D1 rejects with `too many SQL variables` once
 * the dataset outgrows its per-statement parameter ceiling. 130 ids — more
 * than two full chunks — exercise the chunked assembly path that is always
 * active, not a feature flag.
 */
describe("repository batch chunking", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("assembles trade details for more ids than one statement can bind", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    const account = await seedAccount(db, user.id);

    const created: transactionsRepo.TransactionRow[] = [];
    for (let index = 0; index < 130; index += 1) {
      created.push(
        await transactionsRepo.create(db, user.id, {
          accountId: account.id,
          type: "investment",
          date: "2026-01-31",
          amount: 100 + index,
          currency: "EUR",
          operation: {
            symbol: `SYM-${index}`,
            side: "buy",
            units: index + 1,
            unitPrice: 10 + index,
            fee: index,
          },
        }),
      );
    }

    const details = await transactionsRepo.listTradeDetailsByTransactions(
      db,
      user.id,
      created.map((transaction) => transaction.id),
    );

    expect(details).toHaveLength(130);
    for (const [index, transaction] of created.entries()) {
      const detail = details.get(transaction.id);
      expect(detail).toBeDefined();
      expect(detail?.transactionId).toBe(transaction.id);
      expect(detail?.symbol).toBe(`SYM-${index}`);
      expect(detail?.side).toBe("buy");
      expect(detail?.quantity).toBe(String(index + 1));
      expect(detail?.price).toBe(10 + index);
      expect(detail?.fee).toBe(index);
    }
  });

  it("keeps the userId scope when a chunk spans more than one user", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    const other = await seedUser(db);
    const account = await seedAccount(db, user.id);
    const otherAccount = await seedAccount(db, other.id);

    const mine = await transactionsRepo.create(db, user.id, {
      accountId: account.id,
      type: "investment",
      date: "2026-01-31",
      amount: 100,
      currency: "EUR",
      operation: { symbol: "MINE", side: "buy", units: 1, unitPrice: 10, fee: 0 },
    });
    const theirs = await transactionsRepo.create(db, other.id, {
      accountId: otherAccount.id,
      type: "investment",
      date: "2026-01-31",
      amount: 100,
      currency: "EUR",
      operation: { symbol: "THEIRS", side: "buy", units: 1, unitPrice: 10, fee: 0 },
    });

    const details = await transactionsRepo.listTradeDetailsByTransactions(db, user.id, [
      mine.id,
      theirs.id,
    ]);

    expect([...details.keys()]).toEqual([mine.id]);
    expect(details.get(mine.id)?.symbol).toBe("MINE");
  });
});
