import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

    const created = await goalsRepo.create(db, user.id, {
      key: "shortTermFund",
      name: "Fondo de emergencia",
      targetAmount: 6000,
      currency: "EUR",
    });
    expect(created.targetAmount).toBe(6000);

    const updated = await goalsRepo.update(db, user.id, created.id, { targetAmount: 7000 });
    expect(updated?.targetAmount).toBe(7000);

    expect(await goalsRepo.remove(db, user.id, created.id)).toBe(true);
  });

  it("rejects creating a goal for a non-existent user (FK violation)", async () => {
    const { db } = testDb;
    await expect(
      goalsRepo.create(db, "does-not-exist", {
        key: "x",
        name: "x",
        targetAmount: 1,
        currency: "EUR",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    const created = await goalsRepo.create(db, userA.id, {
      key: "shortTermFund",
      name: "Fondo de emergencia",
      targetAmount: 6000,
      currency: "EUR",
    });

    expect(await goalsRepo.get(db, userB.id, created.id)).toBeUndefined();
    expect(await goalsRepo.listByUser(db, userB.id)).toHaveLength(0);
  });
});
