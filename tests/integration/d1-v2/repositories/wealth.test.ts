import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as wealthRepo from "../../../../src/db/repositories/wealth";
import { createTestDb, type TestDatabase } from "../setup";
import { seedAccount, seedUser } from "./fixtures";
import { runWithDb } from '../../../../src/db/database'

describe("wealth repository", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  describe("wealth snapshots", () => {
    it("creates, reads, updates and deletes a snapshot (CRUD)", async () => {
      const { db } = testDb;
      const user = await seedUser(db);

      const created = await runWithDb(db, wealthRepo.create(user.id, {
        snapshotDate: "2026-01-31",
        year: 2026,
        month: 1,
      }));
      expect(created.year).toBe(2026);

      const updated = await runWithDb(db, wealthRepo.update(user.id, created.id, { month: 2 }));
      expect(updated?.month).toBe(2);

      expect(await runWithDb(db, wealthRepo.remove(user.id, created.id))).toBe(true);
    });

    it("rejects creating a snapshot for a non-existent user (FK violation)", async () => {
      const { db } = testDb;
      await expect(
        runWithDb(db, wealthRepo.create("does-not-exist", { snapshotDate: "2026-01-31", year: 2026, month: 1 })),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    });

    it("enforces cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);
      const created = await runWithDb(db, wealthRepo.create(userA.id, {
        snapshotDate: "2026-01-31",
        year: 2026,
        month: 1,
      }));

      expect(await runWithDb(db, wealthRepo.get(userB.id, created.id))).toBeUndefined();
      expect(await runWithDb(db, wealthRepo.listByUser(userB.id))).toHaveLength(0);
    });
  });

  describe("snapshot balances", () => {
    it("creates, reads, and deletes a balance (CRUD) with money conversion", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      const account = await seedAccount(db, user.id);
      const snapshot = await runWithDb(db, wealthRepo.create(user.id, {
        snapshotDate: "2026-01-31",
        year: 2026,
        month: 1,
      }));

      const created = await runWithDb(db, wealthRepo.createBalance(user.id, {
        snapshotId: snapshot.id,
        accountId: account.id,
        balance: 1234.56,
        currency: "EUR",
      }));
      expect(created.balance).toBe(1234.56);

      expect(await runWithDb(db, wealthRepo.listBalancesBySnapshot(user.id, snapshot.id))).toHaveLength(1);
      expect(await runWithDb(db, wealthRepo.removeBalance(user.id, created.id))).toBe(true);
    });

    it("rejects creating a balance for a non-existent snapshot (FK violation)", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      await expect(
        runWithDb(db, wealthRepo.createBalance(user.id, {
          snapshotId: "does-not-exist",
          balance: 1,
          currency: "EUR",
        })),
      ).rejects.toThrow(/no existe o no pertenece/i);
    });

    it("enforces cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);
      const snapshot = await runWithDb(db, wealthRepo.create(userA.id, {
        snapshotDate: "2026-01-31",
        year: 2026,
        month: 1,
      }));
      const created = await runWithDb(db, wealthRepo.createBalance(userA.id, {
        snapshotId: snapshot.id,
        balance: 1,
        currency: "EUR",
      }));

      expect(await runWithDb(db, wealthRepo.getBalance(userB.id, created.id))).toBeUndefined();
    });
  });
});
