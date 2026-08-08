import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as budgetEntriesRepo from "../../../../src/db/repositories/budget-entries";
import { createTestDb, type TestDatabase } from "../setup";
import { seedCategory, seedUser } from "./fixtures";

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

    const created = await budgetEntriesRepo.create(db, user.id, {
      categoryId: category.id,
      year: 2026,
      month: 1,
      amount: 300,
      currency: "EUR",
    });
    expect(created.amount).toBe(300);

    const updated = await budgetEntriesRepo.update(db, user.id, created.id, { amount: 350 });
    expect(updated?.amount).toBe(350);

    expect(await budgetEntriesRepo.remove(db, user.id, created.id)).toBe(true);
  });

  it("rejects creating a budget entry for a non-existent category (WP10 ownership guard, formerly a raw FK violation)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    await expect(
      budgetEntriesRepo.create(db, user.id, {
        categoryId: "does-not-exist",
        year: 2026,
        month: 1,
        amount: 1,
        currency: "EUR",
      }),
    ).rejects.toThrow(/no existe o no pertenece al usuario/i);
  });

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    const category = await seedCategory(db, userA.id);
    const created = await budgetEntriesRepo.create(db, userA.id, {
      categoryId: category.id,
      year: 2026,
      month: 1,
      amount: 300,
      currency: "EUR",
    });

    expect(await budgetEntriesRepo.get(db, userB.id, created.id)).toBeUndefined();
    expect(await budgetEntriesRepo.listByUser(db, userB.id)).toHaveLength(0);
  });
});
