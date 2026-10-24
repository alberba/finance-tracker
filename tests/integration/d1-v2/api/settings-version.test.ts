import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as accountsRepository from "../../../../src/db/repositories/accounts";
import * as userSettingsRepository from "../../../../src/db/repositories/user-settings";
import { applySyncBatch } from "../../../../src/lib/server/sync/apply-command";
import { createTestDb, type TestDatabase } from "../setup";
import { seedAccount, seedUser } from "../repositories/fixtures";
import { runWithDb } from '../../../../src/db/database'

/**
 * `user_settings` has no `entityId` to address, so `baseVersion` is its only
 * optimistic-concurrency guard (audit §6.4): two devices changing the currency
 * used to end in a silent last-write-wins with no conflict the queue could
 * rebase.
 */
describe("settingsUpdate carries optimistic concurrency (audit §6.4)", () => {
  let testDb: TestDatabase;
  let userId: string;

  beforeEach(async () => {
    testDb = createTestDb();
    userId = (await seedUser(testDb.db)).id;
  });

  afterEach(() => {
    testDb.close();
  });

  it("applies the patch when baseVersion matches the stored settings", async () => {
    const settings = await runWithDb(testDb.db, userSettingsRepository.create(userId, { currency: "EUR" }));

    const result = await applySyncBatch(testDb.db, userId, [
      {
        commandId: "settings-fresh",
        action: "settingsUpdate",
        baseVersion: settings.version,
        patch: { currency: "USD" },
      },
    ]);

    expect(result.results[0].status).toBe("applied");
    expect((await runWithDb(testDb.db, userSettingsRepository.get(userId)))?.currency).toBe("USD");
  });

  it("conflicts on a stale baseVersion, reports the stored version and leaves the row alone", async () => {
    const settings = await runWithDb(testDb.db, userSettingsRepository.create(userId, { currency: "EUR" }));
    // Another device moved the row on after this one read it.
    await runWithDb(testDb.db, userSettingsRepository.update(userId, { currency: "GBP" }, settings.version));

    const result = await applySyncBatch(testDb.db, userId, [
      {
        commandId: "settings-stale",
        action: "settingsUpdate",
        baseVersion: settings.version,
        patch: { currency: "USD" },
      },
    ]);

    expect(result.results[0]).toMatchObject({
      status: "conflict",
      currentVersion: settings.version + 1,
    });
    expect(result.halted).toBe(true);
    expect((await runWithDb(testDb.db, userSettingsRepository.get(userId)))?.currency).toBe("GBP");
  });

  it("treats a patch the server already holds as a replay, not a conflict", async () => {
    const settings = await runWithDb(testDb.db, userSettingsRepository.create(userId, { currency: "EUR" }));
    await runWithDb(testDb.db, userSettingsRepository.update(userId, { currency: "USD" }, settings.version));

    const result = await applySyncBatch(testDb.db, userId, [
      {
        commandId: "settings-replay",
        action: "settingsUpdate",
        baseVersion: settings.version,
        patch: { currency: "USD" },
      },
    ]);

    expect(result.results[0].status).toBe("noop");
  });

  it("does not read a TWR-only command as an already-applied replay", async () => {
    const account = await seedAccount(testDb.db, userId);
    const settings = await runWithDb(testDb.db, userSettingsRepository.create(userId, { currency: "EUR" }));
    await runWithDb(testDb.db, userSettingsRepository.update(userId, { currency: "GBP" }, settings.version));

    // The patch carries no settings column at all, and an empty patch is
    // trivially "already held". Reading that as a replay would skip the TWR
    // write entirely, so it has to be a conflict.
    const stale = await applySyncBatch(testDb.db, userId, [
      {
        commandId: "twr-stale",
        action: "settingsUpdate",
        baseVersion: settings.version,
        patch: { twrLiquidityAccountIds: [account.id] },
      },
    ]);
    expect(stale.results[0].status).toBe("conflict");
    expect(await accountsRepository.listTwrLiquidityAccountsByUser(testDb.db, userId)).toHaveLength(0);

    const fresh = await applySyncBatch(testDb.db, userId, [
      {
        commandId: "twr-fresh",
        action: "settingsUpdate",
        baseVersion: settings.version + 1,
        patch: { twrLiquidityAccountIds: [account.id] },
      },
    ]);
    expect(fresh.results[0].status).toBe("applied");
    expect(await accountsRepository.listTwrLiquidityAccountsByUser(testDb.db, userId)).toMatchObject([
      { accountId: account.id },
    ]);
  });

  it("still creates settings for a command that carries no baseVersion", async () => {
    const result = await applySyncBatch(testDb.db, userId, [
      { commandId: "settings-legacy", action: "settingsUpdate", patch: { currency: "USD" } },
    ]);

    expect(result.results[0].status).toBe("applied");
    expect((await runWithDb(testDb.db, userSettingsRepository.get(userId)))?.currency).toBe("USD");
  });
});
