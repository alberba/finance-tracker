import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as pendingMovementsRepo from "../../../../src/db/repositories/pending-movements";
import * as recurringRulesRepo from "../../../../src/db/repositories/recurring-rules";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";

async function seedRule(db: TestDatabase["db"], userId: string) {
  return recurringRulesRepo.create(db, userId, {
    name: "Alquiler",
    type: "expense",
    amount: 750,
    currency: "EUR",
    frequency: "monthly",
  });
}

describe("pending-movements repository", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("creates, reads, updates and deletes a pending movement (CRUD)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    const rule = await seedRule(db, user.id);

    const created = await pendingMovementsRepo.create(db, user.id, {
      recurringRuleId: rule.id,
      amount: 750,
      currency: "EUR",
      dueDate: "2026-02-01",
    });
    expect(created.amount).toBe(750);

    const updated = await pendingMovementsRepo.update(db, user.id, created.id, { status: "confirmed" });
    expect(updated?.status).toBe("confirmed");

    expect(await pendingMovementsRepo.remove(db, user.id, created.id)).toBe(true);
  });

  it("rejects creating a pending movement for a non-existent rule (WP10 ownership guard, formerly a raw FK violation)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    await expect(
      pendingMovementsRepo.create(db, user.id, {
        recurringRuleId: "does-not-exist",
        amount: 1,
        currency: "EUR",
        dueDate: "2026-02-01",
      }),
    ).rejects.toThrow(/no existe o no pertenece al usuario/i);
  });

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    const rule = await seedRule(db, userA.id);
    const created = await pendingMovementsRepo.create(db, userA.id, {
      recurringRuleId: rule.id,
      amount: 750,
      currency: "EUR",
      dueDate: "2026-02-01",
    });

    expect(await pendingMovementsRepo.get(db, userB.id, created.id)).toBeUndefined();
    expect(await pendingMovementsRepo.listByUser(db, userB.id)).toHaveLength(0);
  });
});
