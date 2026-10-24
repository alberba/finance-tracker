import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as syncRepo from "../../../../src/db/repositories/sync";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";
import { runWithDb } from '../../../../src/db/database'

describe("sync repository", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  describe("user revisions", () => {
    it("creates the cursor on first ensure, bumps it, and reads it (CRUD)", async () => {
      const { db } = testDb;
      const user = await seedUser(db);

      const ensured = await runWithDb(db, syncRepo.ensureRevision(user.id));
      expect(ensured.revision).toBe(0);

      const bumped = await runWithDb(db, syncRepo.bumpRevision(user.id));
      expect(bumped.revision).toBe(1);

      expect(await runWithDb(db, syncRepo.getRevision(user.id))).toMatchObject({ revision: 1 });
      expect(await runWithDb(db, syncRepo.removeRevision(user.id))).toBe(true);
    });

    it("rejects a revision cursor for a non-existent user (FK violation)", async () => {
      const { db } = testDb;
      await expect(runWithDb(db, syncRepo.ensureRevision("does-not-exist"))).rejects.toThrow(
        /FOREIGN KEY constraint failed/i,
      );
    });

    it("enforces cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);
      await runWithDb(db, syncRepo.bumpRevision(userA.id));

      expect(await runWithDb(db, syncRepo.getRevision(userB.id))).toBeUndefined();
    });
  });

  describe("sync commands", () => {
    it("creates, reads and deletes a command (CRUD), rejecting duplicate commandIds", async () => {
      const { db } = testDb;
      const user = await seedUser(db);

      const created = await runWithDb(db, syncRepo.createCommand(user.id, {
        id: "cmd-1",
        commandType: "transaction.create",
        payload: "{}",
      }));
      expect(created.id).toBe("cmd-1");

      expect(await runWithDb(db, syncRepo.getCommand(user.id, "cmd-1"))).toMatchObject({ commandType: "transaction.create" });

      await expect(
        runWithDb(db, syncRepo.createCommand(user.id, { id: "cmd-1", commandType: "transaction.create", payload: "{}" })),
      ).rejects.toThrow();

      expect(await runWithDb(db, syncRepo.remove(user.id, "cmd-1"))).toBe(true);
    });

    it("rejects creating a command for a non-existent user (FK violation)", async () => {
      const { db } = testDb;
      await expect(
        runWithDb(db, syncRepo.createCommand("does-not-exist", { id: "cmd-1", commandType: "x", payload: "{}" })),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    });

    it("enforces cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);
      await runWithDb(db, syncRepo.createCommand(userA.id, { id: "cmd-a", commandType: "x", payload: "{}" }));

      expect(await runWithDb(db, syncRepo.getCommand(userB.id, "cmd-a"))).toBeUndefined();
      expect(await runWithDb(db, syncRepo.listCommandsByUser(userB.id))).toHaveLength(0);
    });
  });

  describe("sync changes", () => {
    it("creates changes and walks them via listChangesSince (CRUD)", async () => {
      const { db } = testDb;
      const user = await seedUser(db);

      await runWithDb(db, syncRepo.createChange(user.id, {
        revision: 1,
        entityType: "transaction",
        entityId: "t1",
        changeType: "created",
      }));
      await runWithDb(db, syncRepo.createChange(user.id, {
        revision: 2,
        entityType: "transaction",
        entityId: "t2",
        changeType: "created",
      }));

      expect(await runWithDb(db, syncRepo.listChangesByUser(user.id))).toHaveLength(2);
      expect(await runWithDb(db, syncRepo.listChangesSince(user.id, 1))).toHaveLength(1);
    });

    it("rejects creating a change for a non-existent user (FK violation)", async () => {
      const { db } = testDb;
      await expect(
        runWithDb(db, syncRepo.createChange("does-not-exist", {
          revision: 1,
          entityType: "transaction",
          entityId: "t1",
          changeType: "created",
        })),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    });

    it("enforces cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);
      await runWithDb(db, syncRepo.createChange(userA.id, {
        revision: 1,
        entityType: "transaction",
        entityId: "t1",
        changeType: "created",
      }));

      expect(await runWithDb(db, syncRepo.listChangesByUser(userB.id))).toHaveLength(0);
    });
  });
});
