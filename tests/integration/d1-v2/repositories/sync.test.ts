import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as syncRepo from "../../../../src/db/repositories/sync";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";

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

      const ensured = await syncRepo.ensureRevision(db, user.id);
      expect(ensured.revision).toBe(0);

      const bumped = await syncRepo.bumpRevision(db, user.id);
      expect(bumped.revision).toBe(1);

      expect(await syncRepo.getRevision(db, user.id)).toMatchObject({ revision: 1 });
      expect(await syncRepo.removeRevision(db, user.id)).toBe(true);
    });

    it("rejects a revision cursor for a non-existent user (FK violation)", async () => {
      const { db } = testDb;
      await expect(syncRepo.ensureRevision(db, "does-not-exist")).rejects.toThrow(
        /FOREIGN KEY constraint failed/i,
      );
    });

    it("enforces cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);
      await syncRepo.bumpRevision(db, userA.id);

      expect(await syncRepo.getRevision(db, userB.id)).toBeUndefined();
    });
  });

  describe("sync commands", () => {
    it("creates, reads and deletes a command (CRUD), rejecting duplicate commandIds", async () => {
      const { db } = testDb;
      const user = await seedUser(db);

      const created = await syncRepo.createCommand(db, user.id, {
        id: "cmd-1",
        commandType: "transaction.create",
        payload: "{}",
      });
      expect(created.id).toBe("cmd-1");

      expect(await syncRepo.getCommand(db, user.id, "cmd-1")).toMatchObject({ commandType: "transaction.create" });

      await expect(
        syncRepo.createCommand(db, user.id, { id: "cmd-1", commandType: "transaction.create", payload: "{}" }),
      ).rejects.toThrow();

      expect(await syncRepo.remove(db, user.id, "cmd-1")).toBe(true);
    });

    it("rejects creating a command for a non-existent user (FK violation)", async () => {
      const { db } = testDb;
      await expect(
        syncRepo.createCommand(db, "does-not-exist", { id: "cmd-1", commandType: "x", payload: "{}" }),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    });

    it("enforces cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);
      await syncRepo.createCommand(db, userA.id, { id: "cmd-a", commandType: "x", payload: "{}" });

      expect(await syncRepo.getCommand(db, userB.id, "cmd-a")).toBeUndefined();
      expect(await syncRepo.listCommandsByUser(db, userB.id)).toHaveLength(0);
    });
  });

  describe("sync changes", () => {
    it("creates changes and walks them via listChangesSince (CRUD)", async () => {
      const { db } = testDb;
      const user = await seedUser(db);

      await syncRepo.createChange(db, user.id, {
        revision: 1,
        entityType: "transaction",
        entityId: "t1",
        changeType: "created",
      });
      await syncRepo.createChange(db, user.id, {
        revision: 2,
        entityType: "transaction",
        entityId: "t2",
        changeType: "created",
      });

      expect(await syncRepo.listChangesByUser(db, user.id)).toHaveLength(2);
      expect(await syncRepo.listChangesSince(db, user.id, 1)).toHaveLength(1);
    });

    it("rejects creating a change for a non-existent user (FK violation)", async () => {
      const { db } = testDb;
      await expect(
        syncRepo.createChange(db, "does-not-exist", {
          revision: 1,
          entityType: "transaction",
          entityId: "t1",
          changeType: "created",
        }),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    });

    it("enforces cross-user isolation", async () => {
      const { db } = testDb;
      const userA = await seedUser(db);
      const userB = await seedUser(db);
      await syncRepo.createChange(db, userA.id, {
        revision: 1,
        entityType: "transaction",
        entityId: "t1",
        changeType: "created",
      });

      expect(await syncRepo.listChangesByUser(db, userB.id)).toHaveLength(0);
    });
  });
});
