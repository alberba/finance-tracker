import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as recurringRulesRepo from "../../../../src/db/repositories/recurring-rules";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";
import { runWithDb } from '../../../../src/db/database'

describe("recurring-rules repository", () => {
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
    const created = await runWithDb(db, recurringRulesRepo.create(userA.id, {
      name: "Alquiler",
      type: "expense",
      amount: 750,
      currency: "EUR",
      frequency: "monthly",
    }));

    expect(await runWithDb(db, recurringRulesRepo.get(userB.id, created.id))).toBeUndefined();
    expect(await runWithDb(db, recurringRulesRepo.listByUser(userB.id))).toHaveLength(0);
  });
});
