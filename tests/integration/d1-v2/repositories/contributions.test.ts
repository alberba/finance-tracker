import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as contributionsRepo from "../../../../src/db/repositories/contributions";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";
import { runWithDb } from '../../../../src/db/database'

describe("contributions repository", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  describe("contributions", () => {
    it("enforces cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);
      const created = await runWithDb(db, contributionsRepo.create(userA.id, {
        date: "2026-01-31",
        amount: 500,
        currency: "EUR",
      }));

      expect(await runWithDb(db, contributionsRepo.get(userB.id, created.id))).toBeUndefined();
      expect(await runWithDb(db, contributionsRepo.listByUser(userB.id))).toHaveLength(0);
    });
  });

  describe("contribution allocations", () => {
    it("rejects creating an allocation for a non-existent contribution (FK violation)", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      await expect(
        runWithDb(db, contributionsRepo.createAllocation(user.id, {
          contributionId: "does-not-exist",
          amount: 1,
          currency: "EUR",
        })),
      ).rejects.toThrow(/no existe o no pertenece/i);
    });

    it("enforces cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);
      const contribution = await runWithDb(db, contributionsRepo.create(userA.id, {
        date: "2026-01-31",
        amount: 500,
        currency: "EUR",
      }));
      const created = await runWithDb(db, contributionsRepo.createAllocation(userA.id, {
        contributionId: contribution.id,
        amount: 300,
        currency: "EUR",
      }));

      expect(await runWithDb(db, contributionsRepo.getAllocation(userB.id, created.id))).toBeUndefined();
    });
  });
});
