import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { accounts, users } from "../../../src/db/schema";
import { createTestDb, type TestDatabase } from "./setup";

/**
 * WP5 acceptance criterion: "a sample repository test (e.g. accounts CRUD
 * + FK violation rejected) passes against real local D1". `accounts` is
 * used here (rather than a WP6 repository, which doesn't exist yet) to
 * prove the tier itself — real migrations, real FK enforcement, real
 * Drizzle query builder — against `better-sqlite3`.
 */
describe("d1-v2 integration: accounts", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  async function seedUser() {
    const { db } = testDb;
    const [user] = await db
      .insert(users)
      .values({
        email: "owner@example.com",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .returning();
    return user;
  }

  it("rejects inserting an account for a non-existent user (FK violation)", async () => {
    const { db } = testDb;
    const now = new Date().toISOString();

    await expect(
      db.insert(accounts).values({
        userId: "does-not-exist",
        name: "Cuenta huérfana",
        kind: "cash",
        currency: "EUR",
        openingBalanceMinor: 0,
        createdAt: now,
        updatedAt: now,
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("enforces cross-user isolation via user_id (a query scoped to user A never returns user B's rows)", async () => {
    const { db } = testDb;
    const userA = await seedUser();
    const [userB] = await db
      .insert(users)
      .values({
        email: "other@example.com",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .returning();

    const now = new Date().toISOString();
    await db.insert(accounts).values({
      userId: userA.id,
      name: "Cuenta A",
      kind: "cash",
      currency: "EUR",
      openingBalanceMinor: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(accounts).values({
      userId: userB.id,
      name: "Cuenta B",
      kind: "cash",
      currency: "EUR",
      openingBalanceMinor: 0,
      createdAt: now,
      updatedAt: now,
    });

    const userAAccounts = await db.select().from(accounts).where(eq(accounts.userId, userA.id));
    expect(userAAccounts).toHaveLength(1);
    expect(userAAccounts[0].name).toBe("Cuenta A");
  });
});
