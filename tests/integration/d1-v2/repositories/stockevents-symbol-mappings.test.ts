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

  it("creates, reads, updates and deletes a mapping (CRUD)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);

    const created = await runWithDb(db, mappingsRepo.create(user.id, { stockeventsSymbol: "AAPL" }));
    expect(created.stockeventsSymbol).toBe("AAPL");

    const updated = await runWithDb(db, mappingsRepo.update(user.id, created.id, { stockeventsSymbol: "AAPL.US" }));
    expect(updated?.stockeventsSymbol).toBe("AAPL.US");

    expect(await runWithDb(db, mappingsRepo.remove(user.id, created.id))).toBe(true);
  });

  it("rejects creating a mapping for a non-existent user (FK violation)", async () => {
    const { db } = testDb;
    await expect(
      runWithDb(db, mappingsRepo.create("does-not-exist", { stockeventsSymbol: "AAPL" })),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
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
