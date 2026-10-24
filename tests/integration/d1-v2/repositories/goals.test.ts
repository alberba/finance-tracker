import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runWithDb } from "../../../../src/db/database";
import * as goalsRepo from "../../../../src/db/repositories/goals";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";

describe("goals repository", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("creates, reads, updates and deletes a goal (CRUD)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);

    const created = await runWithDb(db, goalsRepo.create(user.id, {
      key: "shortTermFund",
      name: "Fondo de emergencia",
      targetAmount: 6000,
      currency: "EUR",
    }));
    expect(created.targetAmount).toBe(6000);

    const updated = await runWithDb(db, goalsRepo.update(user.id, created.id, { targetAmount: 7000 }));
    expect(updated?.targetAmount).toBe(7000);

    expect(await runWithDb(db, goalsRepo.remove(user.id, created.id))).toBe(true);
  });

  it("rejects creating a goal for a non-existent user (FK violation)", async () => {
    const { db } = testDb;
    await expect(
      runWithDb(db, goalsRepo.create("does-not-exist", {
        key: "x",
        name: "x",
        targetAmount: 1,
        currency: "EUR",
      })),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    const created = await runWithDb(db, goalsRepo.create(userA.id, {
      key: "shortTermFund",
      name: "Fondo de emergencia",
      targetAmount: 6000,
      currency: "EUR",
    }));

    expect(await runWithDb(db, goalsRepo.get(userB.id, created.id))).toBeUndefined();
    expect(await runWithDb(db, goalsRepo.listByUser(userB.id))).toHaveLength(0);
  });
});
