import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as mappingsRepo from "../../../../src/db/repositories/stockevents-symbol-mappings";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";

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

    const created = await mappingsRepo.create(db, user.id, { stockeventsSymbol: "AAPL" });
    expect(created.stockeventsSymbol).toBe("AAPL");

    const updated = await mappingsRepo.update(db, user.id, created.id, { stockeventsSymbol: "AAPL.US" });
    expect(updated?.stockeventsSymbol).toBe("AAPL.US");

    expect(await mappingsRepo.remove(db, user.id, created.id)).toBe(true);
  });

  it("rejects creating a mapping for a non-existent user (FK violation)", async () => {
    const { db } = testDb;
    await expect(
      mappingsRepo.create(db, "does-not-exist", { stockeventsSymbol: "AAPL" }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    const created = await mappingsRepo.create(db, userA.id, { stockeventsSymbol: "AAPL" });

    expect(await mappingsRepo.get(db, userB.id, created.id)).toBeUndefined();
    expect(await mappingsRepo.listByUser(db, userB.id)).toHaveLength(0);
  });
});
