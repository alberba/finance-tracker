import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as pendingMovementsRepo from "../../../../src/db/repositories/pending-movements";
import * as recurringRulesRepo from "../../../../src/db/repositories/recurring-rules";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";
import { runWithDb } from '../../../../src/db/database'

describe("recurring-rules repository", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("creates, reads, updates and deletes a recurring rule (CRUD)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);

    const created = await runWithDb(db, recurringRulesRepo.create(user.id, {
      name: "Alquiler",
      type: "expense",
      amount: 750,
      currency: "EUR",
      frequency: "monthly",
    }));
    expect(created.amount).toBe(750);

    const updated = await runWithDb(db, recurringRulesRepo.update(user.id, created.id, { status: "paused" }));
    expect(updated?.status).toBe("paused");

    expect(await runWithDb(db, recurringRulesRepo.remove(user.id, created.id))).toBe(true);
  });

  it("rejects creating a rule for a non-existent user (FK violation)", async () => {
    const { db } = testDb;
    await expect(
      runWithDb(db, recurringRulesRepo.create("does-not-exist", {
        name: "x",
        type: "expense",
        amount: 1,
        currency: "EUR",
        frequency: "monthly",
      })),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    const created = await runWithDb(db, recurringRulesRepo.create(userA.id, {
      name: "Alquiler",
      type: "expense",
      amount: 750,
      currency: "EUR",
      frequency: "monthly",
    }));

    expect(await runWithDb(db, recurringRulesRepo.get(userB.id, created.id))).toBeUndefined();
    expect(await runWithDb(db, recurringRulesRepo.listByUser(userB.id))).toHaveLength(0);
  });

  it("deletes a rule's pending occurrences with it instead of a raw FK violation (audit §2.6)", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    const rule = await runWithDb(db, recurringRulesRepo.create(user.id, {
      name: "Alquiler",
      type: "expense",
      amount: 750,
      currency: "EUR",
      frequency: "monthly",
    }));
    const pending = await pendingMovementsRepo.create(db, user.id, {
      recurringRuleId: rule.id,
      amount: 750,
      currency: "EUR",
      dueDate: "2026-10-01",
    });

    expect(await runWithDb(db, recurringRulesRepo.remove(user.id, rule.id))).toBe(true);

    expect(await pendingMovementsRepo.get(db, user.id, pending.id)).toBeUndefined();
  });
});
