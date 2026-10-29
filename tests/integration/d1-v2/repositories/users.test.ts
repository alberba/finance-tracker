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

  it("creates, reads, updates and deletes a user (CRUD)", async () => {
    const { db } = testDb;
    const created = await runWithDb(db, usersRepo.create({ email: "owner@example.com", displayName: "Owner" }));
    expect(created.id).toEqual(expect.any(String));

    const found = await runWithDb(db, usersRepo.get(created.id));
    expect(found?.email).toBe("owner@example.com");

    const byEmail = await runWithDb(db, usersRepo.getByEmail("owner@example.com"));
    expect(byEmail?.id).toBe(created.id);

    const updated = await runWithDb(db, usersRepo.update(created.id, { displayName: "Renamed" }));
    expect(updated?.displayName).toBe("Renamed");

    const removed = await runWithDb(db, usersRepo.remove(created.id));
    expect(removed).toBe(true);
    expect(await runWithDb(db, usersRepo.get(created.id))).toBeUndefined();
  });

  it("deletes a user's report ownership rows before the account (FK)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    await runWithDb(db, issueReportsRepo.recordSubmission(user.id, 340, "2026-10-01T00:00:00.000Z"));

    expect(await runWithDb(db, usersRepo.remove(user.id))).toBe(true);
    expect(await runWithDb(db, issueReportsRepo.listByUser(user.id))).toEqual([]);
  });

  it("bulk inserts users", async () => {
    const { db } = testDb;
    const rows = await runWithDb(db, usersRepo.bulkInsert([
      { email: "a@example.com" },
      { email: "b@example.com" },
    ]));
    expect(rows).toHaveLength(2);
  });

  it("rejects creating an identity for a non-existent user (FK violation)", async () => {
    const { db } = testDb;
    await expect(
      runWithDb(db, usersRepo.createIdentity("does-not-exist", { provider: "cf-access", subject: "sub-1" })),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
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

  it("looks up an identity globally by (provider, subject)", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const created = await runWithDb(db, usersRepo.createIdentity(userA.id, {
      provider: "cf-access",
      subject: "sub-global",
    }));

    const found = await runWithDb(db, usersRepo.getIdentityByProviderSubject("cf-access", "sub-global"));
    expect(found?.id).toBe(created.id);
  });
});
