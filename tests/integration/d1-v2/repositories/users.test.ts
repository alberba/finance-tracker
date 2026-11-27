import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as issueReportsRepo from "../../../../src/db/repositories/issue-reports";
import * as usersRepo from "../../../../src/db/repositories/users";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";
import { runWithDb } from '../../../../src/db/database'

describe("users repository", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("deletes a user's report ownership rows before the account (FK)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    await runWithDb(db, issueReportsRepo.recordSubmission(user.id, 340, "2026-10-01T00:00:00.000Z"));

    expect(await runWithDb(db, usersRepo.remove(user.id))).toBe(true);
    expect(await runWithDb(db, issueReportsRepo.listByUser(user.id))).toEqual([]);
  });

  it("enforces cross-user isolation for user identities", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);

    await runWithDb(db, usersRepo.createIdentity(userA.id, { provider: "cf-access", subject: "sub-a" }));
    await runWithDb(db, usersRepo.createIdentity(userB.id, { provider: "cf-access", subject: "sub-b" }));

    const identitiesA = await runWithDb(db, usersRepo.listIdentitiesByUser(userA.id));
    expect(identitiesA).toHaveLength(1);
    expect(identitiesA[0].subject).toBe("sub-a");

    const identity = await runWithDb(db, usersRepo.getIdentity(userB.id, identitiesA[0].id));
    expect(identity).toBeUndefined();
  });
});
