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

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    const created = await runWithDb(db, auditEventsRepo.create(userA.id, { eventType: "auth.login" }));

    expect(await runWithDb(db, auditEventsRepo.get(userB.id, created.id))).toBeUndefined();
    expect(await runWithDb(db, auditEventsRepo.listByUser(userB.id))).toHaveLength(0);
  });
});
