import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as accountsRepository from "../../../../src/db/repositories/accounts";
import * as syncRepository from "../../../../src/db/repositories/sync";
import * as transactionsRepository from "../../../../src/db/repositories/transactions";
import { applySyncBatch } from "../../../../src/lib/server/sync/apply-command";
import { createTestDb, type TestDatabase } from "../setup";
import { seedAccount, seedCategory, seedUser } from "../repositories/fixtures";

describe("sync commands that can never succeed are rejected, not retried (audit §2)", () => {
  let testDb: TestDatabase;
  let userId: string;

  beforeEach(async () => {
    testDb = createTestDb();
    userId = (await seedUser(testDb.db)).id;
  });

  afterEach(() => {
    testDb.close();
  });

  async function expectRejectedAndFinalized(commandId: string, results: Awaited<ReturnType<typeof applySyncBatch>>) {
    expect(results.results[0]).toMatchObject({ commandId, status: "rejected" });
    expect(results.results[0].message).toBeTruthy();
    const row = await syncRepository.getCommand(testDb.db, userId, commandId);
    expect(row?.status).toBe("rejected");
    expect(row?.result).not.toBeNull();
  }

  it("rejects a create whose payload fails the entity schema and keeps processing the batch", async () => {
    const result = await applySyncBatch(testDb.db, userId, [
      { commandId: "bad-create", action: "create", entityType: "account", data: { name: "Sin kind" } },
      { commandId: "after-bad", action: "noop" },
    ]);
    await expectRejectedAndFinalized("bad-create", result);
    expect(result.results[1].status).toBe("noop");
    expect(result.halted).toBe(false);
  });

  it("rejects a create carrying a field the entity schema doesn't declare, instead of dropping it silently (issue #138)", async () => {
    const result = await applySyncBatch(testDb.db, userId, [{
      commandId: "unknown-field", action: "create", entityType: "account",
      data: { name: "Cuenta", kind: "cash", currency: "EUR", openingBalance: 0, notARealColumn: "x" },
    }]);
    await expectRejectedAndFinalized("unknown-field", result);
    const accounts = await accountsRepository.listByUser(testDb.db, userId);
    expect(accounts).toHaveLength(0);
  });

  it("rejects an update whose patch fails the entity schema", async () => {
    const account = await seedAccount(testDb.db, userId);
    const result = await applySyncBatch(testDb.db, userId, [{
      commandId: "bad-update", action: "update", entityType: "account",
      entityId: account.id, baseVersion: account.version, patch: { openingBalance: "mucho" },
    }]);
    await expectRejectedAndFinalized("bad-update", result);
  });

  it("rejects a create that references an account the user does not own", async () => {
    const result = await applySyncBatch(testDb.db, userId, [{
      commandId: "foreign-account", action: "create", entityType: "transaction",
      data: { accountId: "local-account-id", type: "investment", date: "2026-09-12", amount: 10, currency: "EUR" },
    }]);
    await expectRejectedAndFinalized("foreign-account", result);
  });

  it("replays a rejection verbatim instead of re-running the mutation", async () => {
    const command = { commandId: "replayed-bad", action: "create" as const, entityType: "account" as const, data: {} };
    await applySyncBatch(testDb.db, userId, [command]);
    const second = await applySyncBatch(testDb.db, userId, [command]);
    expect(second.results[0]).toMatchObject({ status: "rejected", replayed: true });
  });

  it("removes an investment transaction together with its trade detail (§2.6)", async () => {
    const account = await seedAccount(testDb.db, userId);
    const tx = await transactionsRepository.create(testDb.db, userId, {
      accountId: account.id, type: "investment", date: "2026-09-12", amount: 100, currency: "EUR",
    });
    await transactionsRepository.createTradeDetail(testDb.db, userId, {
      transactionId: tx.id, side: "buy", quantity: "1", price: 100, fee: 0, currency: "EUR",
    });

    const result = await applySyncBatch(testDb.db, userId, [{
      commandId: "remove-investment", action: "remove", entityType: "transaction",
      entityId: tx.id, baseVersion: tx.version,
    }]);

    expect(result.results[0].status).toBe("applied");
    expect(await transactionsRepository.getTradeDetailByTransaction(testDb.db, userId, tx.id)).toBeUndefined();
  });

  it("rejects removing a category still referenced by a transaction (§2.6)", async () => {
    const account = await seedAccount(testDb.db, userId);
    const category = await seedCategory(testDb.db, userId);
    await transactionsRepository.create(testDb.db, userId, {
      accountId: account.id, categoryId: category.id, type: "expense", date: "2026-09-12", amount: 5, currency: "EUR",
    });

    const result = await applySyncBatch(testDb.db, userId, [{
      commandId: "remove-used-category", action: "remove", entityType: "category",
      entityId: category.id, baseVersion: category.version,
    }]);

    await expectRejectedAndFinalized("remove-used-category", result);
    expect(await accountsRepository.getCategory(testDb.db, userId, category.id)).toBeDefined();
  });

  it("rejects removing an account still referenced by a transaction (§2.6)", async () => {
    const account = await seedAccount(testDb.db, userId);
    await transactionsRepository.create(testDb.db, userId, {
      accountId: account.id, type: "expense", date: "2026-09-12", amount: 5, currency: "EUR",
    });

    const result = await applySyncBatch(testDb.db, userId, [{
      commandId: "remove-used-account", action: "remove", entityType: "account",
      entityId: account.id, baseVersion: account.version,
    }]);

    await expectRejectedAndFinalized("remove-used-account", result);
    expect(await accountsRepository.get(testDb.db, userId, account.id)).toBeDefined();
  });

  it("still removes an unreferenced category", async () => {
    const category = await seedCategory(testDb.db, userId);
    const result = await applySyncBatch(testDb.db, userId, [{
      commandId: "remove-free-category", action: "remove", entityType: "category",
      entityId: category.id, baseVersion: category.version,
    }]);
    expect(result.results[0].status).toBe("applied");
  });
});
