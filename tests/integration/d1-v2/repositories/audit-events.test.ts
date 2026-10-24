import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as auditEventsRepo from "../../../../src/db/repositories/audit-events";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";
import { runWithDb } from '../../../../src/db/database'

describe("audit-events repository", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("creates, reads and deletes an audit event (CRUD)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);

    const created = await runWithDb(db, auditEventsRepo.create(user.id, {
      eventType: "auth.login",
      metadata: JSON.stringify({ ip: "127.0.0.1" }),
    }));
    expect(created.eventType).toBe("auth.login");

    expect(await runWithDb(db, auditEventsRepo.get(user.id, created.id))).toMatchObject({ eventType: "auth.login" });
    expect(await runWithDb(db, auditEventsRepo.remove(user.id, created.id))).toBe(true);
  });

  it("rejects creating an audit event for a non-existent user (FK violation)", async () => {
    const { db } = testDb;
    await expect(
      runWithDb(db, auditEventsRepo.create("does-not-exist", { eventType: "auth.login" })),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    const created = await runWithDb(db, auditEventsRepo.create(userA.id, { eventType: "auth.login" }));

    expect(await runWithDb(db, auditEventsRepo.get(userB.id, created.id))).toBeUndefined();
    expect(await runWithDb(db, auditEventsRepo.listByUser(userB.id))).toHaveLength(0);
  });
});
