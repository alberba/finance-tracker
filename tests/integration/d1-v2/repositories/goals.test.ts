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
