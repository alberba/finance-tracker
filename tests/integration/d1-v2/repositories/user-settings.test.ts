import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as userSettingsRepo from "../../../../src/db/repositories/user-settings";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";
import { runWithDb } from '../../../../src/db/database'

describe("user-settings repository", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("creates, reads, updates and deletes settings (CRUD)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);

    const created = await runWithDb(db, userSettingsRepo.create(user.id, { currency: "USD", theme: "dark" }));
    expect(created.currency).toBe("USD");

    const found = await runWithDb(db, userSettingsRepo.get(user.id));
    expect(found?.theme).toBe("dark");

    const updated = await runWithDb(db, userSettingsRepo.update(user.id, { theme: "light" }));
    expect(updated?.theme).toBe("light");
    expect(updated?.version).toBe(2);

    const removed = await runWithDb(db, userSettingsRepo.remove(user.id));
    expect(removed).toBe(true);
    expect(await runWithDb(db, userSettingsRepo.get(user.id))).toBeUndefined();
  });

  it("rejects creating settings for a non-existent user (FK violation)", async () => {
    const { db } = testDb;
    await expect(runWithDb(db, userSettingsRepo.create("does-not-exist", {}))).rejects.toThrow(
      /FOREIGN KEY constraint failed/i,
    );
  });

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    await runWithDb(db, userSettingsRepo.create(userA.id, { currency: "EUR" }));

    expect(await runWithDb(db, userSettingsRepo.get(userB.id))).toBeUndefined();
    expect(await runWithDb(db, userSettingsRepo.update(userB.id, { currency: "USD" }))).toBeUndefined();
    expect(await runWithDb(db, userSettingsRepo.remove(userB.id))).toBe(false);
  });

  it("rejects updates and deletes based on a stale version", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    const created = await runWithDb(db, userSettingsRepo.create(user.id));

    expect(await runWithDb(db, userSettingsRepo.update(user.id, { currency: "USD" }, created.version + 1)))
      .toBeUndefined();
    expect(await runWithDb(db, userSettingsRepo.remove(user.id, created.version + 1))).toBe(false);
    expect(await runWithDb(db, userSettingsRepo.get(user.id))).toMatchObject({ currency: "EUR", version: 1 });
  });
});
