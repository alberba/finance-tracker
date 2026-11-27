import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as mappingsRepo from "../../../../src/db/repositories/stockevents-symbol-mappings";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";
import { runWithDb } from '../../../../src/db/database'

describe("stockevents-symbol-mappings repository", () => {
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
    const created = await runWithDb(db, mappingsRepo.create(userA.id, { stockeventsSymbol: "AAPL" }));

    expect(await runWithDb(db, mappingsRepo.get(userB.id, created.id))).toBeUndefined();
    expect(await runWithDb(db, mappingsRepo.listByUser(userB.id))).toHaveLength(0);
  });
});
