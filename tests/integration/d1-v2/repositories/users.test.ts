import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as usersRepo from "../../../../src/db/repositories/users";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";

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
    const created = await usersRepo.create(db, { email: "owner@example.com", displayName: "Owner" });
    expect(created.id).toEqual(expect.any(String));

    const found = await usersRepo.get(db, created.id);
    expect(found?.email).toBe("owner@example.com");

    const byEmail = await usersRepo.getByEmail(db, "owner@example.com");
    expect(byEmail?.id).toBe(created.id);

    const updated = await usersRepo.update(db, created.id, { displayName: "Renamed" });
    expect(updated?.displayName).toBe("Renamed");

    const removed = await usersRepo.remove(db, created.id);
    expect(removed).toBe(true);
    expect(await usersRepo.get(db, created.id)).toBeUndefined();
  });

  it("bulk inserts users", async () => {
    const { db } = testDb;
    const rows = await usersRepo.bulkInsert(db, [
      { email: "a@example.com" },
      { email: "b@example.com" },
    ]);
    expect(rows).toHaveLength(2);
  });

  it("rejects creating an identity for a non-existent user (FK violation)", async () => {
    const { db } = testDb;
    await expect(
      usersRepo.createIdentity(db, "does-not-exist", { provider: "cf-access", subject: "sub-1" }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("enforces cross-user isolation for user identities", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);

    await usersRepo.createIdentity(db, userA.id, { provider: "cf-access", subject: "sub-a" });
    await usersRepo.createIdentity(db, userB.id, { provider: "cf-access", subject: "sub-b" });

    const identitiesA = await usersRepo.listIdentitiesByUser(db, userA.id);
    expect(identitiesA).toHaveLength(1);
    expect(identitiesA[0].subject).toBe("sub-a");

    const identity = await usersRepo.getIdentity(db, userB.id, identitiesA[0].id);
    expect(identity).toBeUndefined();
  });

  it("looks up an identity globally by (provider, subject)", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const created = await usersRepo.createIdentity(db, userA.id, {
      provider: "cf-access",
      subject: "sub-global",
    });

    const found = await usersRepo.getIdentityByProviderSubject(db, "cf-access", "sub-global");
    expect(found?.id).toBe(created.id);
  });
});
