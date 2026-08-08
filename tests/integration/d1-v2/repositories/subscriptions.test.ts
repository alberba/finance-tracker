import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as subscriptionsRepo from "../../../../src/db/repositories/subscriptions";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";

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

    const created = await subscriptionsRepo.create(db, user.id, {
      name: "Streaming",
      amount: 9.99,
      currency: "EUR",
      frequency: "monthly",
    });
    expect(created.amount).toBe(9.99);
    expect(created.isActive).toBe(true);

    const updated = await subscriptionsRepo.update(db, user.id, created.id, { amount: 12.99 });
    expect(updated?.amount).toBe(12.99);

    expect(await subscriptionsRepo.remove(db, user.id, created.id)).toBe(true);
  });

  it("rejects creating a subscription for a non-existent user (FK violation)", async () => {
    const { db } = testDb;
    await expect(
      subscriptionsRepo.create(db, "does-not-exist", {
        name: "x",
        amount: 1,
        currency: "EUR",
        frequency: "monthly",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    const created = await subscriptionsRepo.create(db, userA.id, {
      name: "Streaming",
      amount: 9.99,
      currency: "EUR",
      frequency: "monthly",
    });

    expect(await subscriptionsRepo.get(db, userB.id, created.id)).toBeUndefined();
    expect(await subscriptionsRepo.listByUser(db, userB.id)).toHaveLength(0);
  });
});
