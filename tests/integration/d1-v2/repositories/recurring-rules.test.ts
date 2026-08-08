import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as recurringRulesRepo from "../../../../src/db/repositories/recurring-rules";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";

describe("recurring-rules repository", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("creates, reads, updates and deletes a recurring rule (CRUD)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);

    const created = await recurringRulesRepo.create(db, user.id, {
      name: "Alquiler",
      type: "expense",
      amount: 750,
      currency: "EUR",
      frequency: "monthly",
    });
    expect(created.amount).toBe(750);

    const updated = await recurringRulesRepo.update(db, user.id, created.id, { status: "paused" });
    expect(updated?.status).toBe("paused");

    expect(await recurringRulesRepo.remove(db, user.id, created.id)).toBe(true);
  });

  it("rejects creating a rule for a non-existent user (FK violation)", async () => {
    const { db } = testDb;
    await expect(
      recurringRulesRepo.create(db, "does-not-exist", {
        name: "x",
        type: "expense",
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
    const created = await recurringRulesRepo.create(db, userA.id, {
      name: "Alquiler",
      type: "expense",
      amount: 750,
      currency: "EUR",
      frequency: "monthly",
    });

    expect(await recurringRulesRepo.get(db, userB.id, created.id)).toBeUndefined();
    expect(await recurringRulesRepo.listByUser(db, userB.id)).toHaveLength(0);
  });
});
