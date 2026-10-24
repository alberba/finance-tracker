import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as contributionsRepo from "../../../../src/db/repositories/contributions";
import { createTestDb, type TestDatabase } from "../setup";
import { seedAccount, seedUser } from "./fixtures";
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
    it("creates, reads, updates and deletes a contribution (CRUD)", async () => {
      const { db } = testDb;
      const user = await seedUser(db);

      const created = await runWithDb(db, contributionsRepo.create(user.id, {
        date: "2026-01-31",
        amount: 500,
        currency: "EUR",
        portfolioValue: 10000,
        flow: 500,
      }));
      expect(created.amount).toBe(500);
      expect(created.portfolioValue).toBe(10000);

      const updated = await runWithDb(db, contributionsRepo.update(user.id, created.id, { amount: 600 }));
      expect(updated?.amount).toBe(600);

      expect(await runWithDb(db, contributionsRepo.remove(user.id, created.id))).toBe(true);
    });

    it("rejects creating a contribution for a non-existent user (FK violation)", async () => {
      const { db } = testDb;
      await expect(
        runWithDb(db, contributionsRepo.create("does-not-exist", { date: "2026-01-31", amount: 1, currency: "EUR" })),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    });

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
    it("creates, reads, and deletes an allocation (CRUD)", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      const account = await seedAccount(db, user.id);
      const contribution = await runWithDb(db, contributionsRepo.create(user.id, {
        date: "2026-01-31",
        amount: 500,
        currency: "EUR",
      }));

      const created = await runWithDb(db, contributionsRepo.createAllocation(user.id, {
        contributionId: contribution.id,
        accountId: account.id,
        amount: 300,
        currency: "EUR",
      }));
      expect(created.amount).toBe(300);

      expect(
        await runWithDb(db, contributionsRepo.listAllocationsByContribution(user.id, contribution.id)),
      ).toHaveLength(1);
      expect(await runWithDb(db, contributionsRepo.removeAllocation(user.id, created.id))).toBe(true);
    });

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
