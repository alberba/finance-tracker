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
    it("creates the cursor at 0 on first ensure and bumps it by one", async () => {
      const { db } = testDb;
      const user = await seedUser(db);

      const ensured = await runWithDb(db, syncRepo.ensureRevision(user.id));
      expect(ensured.revision).toBe(0);

      const bumped = await runWithDb(db, syncRepo.bumpRevision(user.id));
      expect(bumped.revision).toBe(1);

      expect(await runWithDb(db, syncRepo.getRevision(user.id))).toMatchObject({ revision: 1 });
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
    it("rejects a duplicate commandId", async () => {
      const { db } = testDb;
      const user = await seedUser(db);
      await runWithDb(db, syncRepo.createCommand(user.id, { id: "cmd-1", commandType: "transaction.create", payload: "{}" }));

      await expect(
        runWithDb(db, syncRepo.createCommand(user.id, { id: "cmd-1", commandType: "transaction.create", payload: "{}" })),
      ).rejects.toThrow(/unique|constraint/i);
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
    it("lists only the changes after the given revision", async () => {
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

      const since = await runWithDb(db, syncRepo.listChangesSince(user.id, 1));
      expect(since.map((change) => change.entityId)).toEqual(["t2"]);
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
