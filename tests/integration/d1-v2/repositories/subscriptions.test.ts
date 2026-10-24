import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as subscriptionsRepo from "../../../../src/db/repositories/subscriptions";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";
import { runWithDb } from '../../../../src/db/database'

describe("subscriptions repository", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("creates, reads, updates and deletes a subscription (CRUD)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);

    const created = await runWithDb(db, subscriptionsRepo.create(user.id, {
      name: "Streaming",
      amount: 9.99,
      currency: "EUR",
      startDate: "2026-09-13",
      nextChargeDate: "2026-10-13",
      frequency: "monthly",
    }));
    expect(created.amount).toBe(9.99);
    expect(created.isActive).toBe(true);
    expect(created.startDate).toBe("2026-09-13");
    expect(created.nextChargeDate).toBe("2026-10-13");

    const updated = await runWithDb(db, subscriptionsRepo.update(user.id, created.id, { amount: 12.99 }));
    expect(updated?.amount).toBe(12.99);
    expect(updated?.startDate).toBe("2026-09-13");
    expect(updated?.nextChargeDate).toBe("2026-10-13");

    expect(await runWithDb(db, subscriptionsRepo.remove(user.id, created.id))).toBe(true);
  });

  it("rejects creating a subscription for a non-existent user (FK violation)", async () => {
    const { db } = testDb;
    await expect(
      runWithDb(db, subscriptionsRepo.create("does-not-exist", {
        name: "x",
        amount: 1,
        currency: "EUR",
        frequency: "monthly",
      })),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    const created = await runWithDb(db, subscriptionsRepo.create(userA.id, {
      name: "Streaming",
      amount: 9.99,
      currency: "EUR",
      frequency: "monthly",
    }));

    expect(await runWithDb(db, subscriptionsRepo.get(userB.id, created.id))).toBeUndefined();
    expect(await runWithDb(db, subscriptionsRepo.listByUser(userB.id))).toHaveLength(0);
  });
});
