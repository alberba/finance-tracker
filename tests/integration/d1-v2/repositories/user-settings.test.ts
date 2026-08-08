import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as userSettingsRepo from "../../../../src/db/repositories/user-settings";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";

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

    const created = await userSettingsRepo.create(db, user.id, { currency: "USD", theme: "dark" });
    expect(created.currency).toBe("USD");

    const found = await userSettingsRepo.get(db, user.id);
    expect(found?.theme).toBe("dark");

    const updated = await userSettingsRepo.update(db, user.id, { theme: "light" });
    expect(updated?.theme).toBe("light");
    expect(updated?.version).toBe(2);

    const removed = await userSettingsRepo.remove(db, user.id);
    expect(removed).toBe(true);
    expect(await userSettingsRepo.get(db, user.id)).toBeUndefined();
  });

  it("rejects creating settings for a non-existent user (FK violation)", async () => {
    const { db } = testDb;
    await expect(userSettingsRepo.create(db, "does-not-exist", {})).rejects.toThrow(
      /FOREIGN KEY constraint failed/i,
    );
  });

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    await userSettingsRepo.create(db, userA.id, { currency: "EUR" });

    expect(await userSettingsRepo.get(db, userB.id)).toBeUndefined();
    expect(await userSettingsRepo.update(db, userB.id, { currency: "USD" })).toBeUndefined();
    expect(await userSettingsRepo.remove(db, userB.id)).toBe(false);
  });
});
