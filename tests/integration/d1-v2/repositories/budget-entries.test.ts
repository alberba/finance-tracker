import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as budgetEntriesRepo from "../../../../src/db/repositories/budget-entries";
import { createTestDb, type TestDatabase } from "../setup";
import { seedCategory, seedUser } from "./fixtures";
import { runWithDb } from '../../../../src/db/database'

describe("budget-entries repository", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("creates, reads, updates and deletes a budget entry (CRUD)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    const category = await seedCategory(db, user.id);

    const created = await runWithDb(db, budgetEntriesRepo.create(user.id, {
      categoryId: category.id,
      year: 2026,
      month: 1,
      amount: 300,
      currency: "EUR",
    }));
    expect(created.amount).toBe(300);

    const updated = await runWithDb(db, budgetEntriesRepo.update(user.id, created.id, { amount: 350 }));
    expect(updated?.amount).toBe(350);

    expect(await runWithDb(db, budgetEntriesRepo.remove(user.id, created.id))).toBe(true);
  });

  it("rejects creating a budget entry for a non-existent category (WP10 ownership guard, formerly a raw FK violation)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    await expect(
      runWithDb(db, budgetEntriesRepo.create(user.id, {
        categoryId: "does-not-exist",
        year: 2026,
        month: 1,
        amount: 1,
        currency: "EUR",
      })),
    ).rejects.toThrow(/no existe o no pertenece al usuario/i);
  });

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    const category = await seedCategory(db, userA.id);
    const created = await runWithDb(db, budgetEntriesRepo.create(userA.id, {
      categoryId: category.id,
      year: 2026,
      month: 1,
      amount: 300,
      currency: "EUR",
    }));

    expect(await runWithDb(db, budgetEntriesRepo.get(userB.id, created.id))).toBeUndefined();
    expect(await runWithDb(db, budgetEntriesRepo.listByUser(userB.id))).toHaveLength(0);
  });
});
