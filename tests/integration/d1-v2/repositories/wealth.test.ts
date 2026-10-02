import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as wealthRepo from "../../../../src/db/repositories/wealth";
import { createTestDb, type TestDatabase } from "../setup";
import { seedAccount, seedUser } from "./fixtures";

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

      const created = await wealthRepo.create(db, user.id, {
        snapshotDate: "2026-01-31",
        year: 2026,
        month: 1,
      });
      expect(created.year).toBe(2026);

      const updated = await wealthRepo.update(db, user.id, created.id, { month: 2 });
      expect(updated?.month).toBe(2);

      expect(await wealthRepo.remove(db, user.id, created.id)).toBe(true);
    });

    it("rejects creating a snapshot for a non-existent user (FK violation)", async () => {
      const { db } = testDb;
      await expect(
        wealthRepo.create(db, "does-not-exist", { snapshotDate: "2026-01-31", year: 2026, month: 1 }),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    });

    it("enforces cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);
      const created = await wealthRepo.create(db, userA.id, {
        snapshotDate: "2026-01-31",
        year: 2026,
        month: 1,
      });

      expect(await wealthRepo.get(db, userB.id, created.id)).toBeUndefined();
      expect(await wealthRepo.listByUser(db, userB.id)).toHaveLength(0);
    });
  });

  describe("snapshot balances", () => {
    it("creates, reads, and deletes a balance (CRUD) with money conversion", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      const account = await seedAccount(db, user.id);
      const snapshot = await wealthRepo.create(db, user.id, {
        snapshotDate: "2026-01-31",
        year: 2026,
        month: 1,
      });

      const created = await wealthRepo.createBalance(db, user.id, {
        snapshotId: snapshot.id,
        accountId: account.id,
        balance: 1234.56,
        currency: "EUR",
      });
      expect(created.balance).toBe(1234.56);

      expect(await wealthRepo.listBalancesBySnapshot(db, user.id, snapshot.id)).toHaveLength(1);
      expect(await wealthRepo.removeBalance(db, user.id, created.id)).toBe(true);
    });

    it("rejects creating a balance for a non-existent snapshot (FK violation)", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      await expect(
        wealthRepo.createBalance(db, user.id, {
          snapshotId: "does-not-exist",
          balance: 1,
          currency: "EUR",
        }),
      ).rejects.toThrow(/no existe o no pertenece/i);
    });

    it("enforces cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);
      const snapshot = await wealthRepo.create(db, userA.id, {
        snapshotDate: "2026-01-31",
        year: 2026,
        month: 1,
      });
      const created = await wealthRepo.createBalance(db, userA.id, {
        snapshotId: snapshot.id,
        balance: 1,
        currency: "EUR",
      });

      expect(await wealthRepo.getBalance(db, userB.id, created.id)).toBeUndefined();
    });
  });
});
