import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as integrationCredentialsRepo from "../../../../src/db/repositories/integration-credentials";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";
import { runWithDb } from '../../../../src/db/database'

const env = { DATA_ENCRYPTION_KEY: "jczGrUcJ9753I5noa+t5lM2U28P2WYQsgwABKiOwguQ=" };

describe("integration-credentials repository", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("creates, reads, updates and deletes a credential (CRUD), encrypting at rest", async () => {
    const { db, sqlite } = testDb;
    const user = await seedUser(db);

    const created = await runWithDb(db, integrationCredentialsRepo.create(user.id,
      { provider: "stockevents", secret: "sk-live-plaintext" },
      env,));
    expect(created.keyVersion).toBe(1);
    expect(created.secret).toBe("sk-live-plaintext");

    // The raw column must never hold the plaintext.
    const raw = sqlite
      .prepare("SELECT ciphertext FROM integration_credentials WHERE id = ?")
      .get(created.id) as { ciphertext: string };
    expect(raw.ciphertext).not.toContain("sk-live-plaintext");

    const byProvider = await runWithDb(db, integrationCredentialsRepo.getByProvider(user.id,
      "stockevents",
      env,));
    expect(byProvider?.id).toBe(created.id);
    expect(byProvider?.secret).toBe("sk-live-plaintext");

    const updated = await runWithDb(db, integrationCredentialsRepo.update(user.id,
      created.id,
      { secret: "sk-live-rotated" },
      env,));
    expect(updated?.secret).toBe("sk-live-rotated");

    expect(await runWithDb(db, integrationCredentialsRepo.remove(user.id, created.id))).toBe(true);
  });

  it("rejects creating a credential for a non-existent user (FK violation)", async () => {
    const { db } = testDb;
    await expect(
      runWithDb(db, integrationCredentialsRepo.create("does-not-exist",
        { provider: "stockevents", secret: "x" },
        env,)),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    const created = await runWithDb(db, integrationCredentialsRepo.create(userA.id,
      { provider: "stockevents", secret: "secret" },
      env,));

    expect(await runWithDb(db, integrationCredentialsRepo.get(userB.id, created.id, env))).toBeUndefined();
    expect(
      await runWithDb(db, integrationCredentialsRepo.getByProvider(userB.id, "stockevents", env)),
    ).toBeUndefined();
    expect(await runWithDb(db, integrationCredentialsRepo.listByUser(userB.id, env))).toHaveLength(0);
  });

  it("rejects updates and deletes based on a stale version", async () => {
    const { db } = testDb;
    const user = await seedUser(db);
    const created = await runWithDb(db, integrationCredentialsRepo.create(user.id,
      { provider: "stockevents", secret: "original" },
      env,));

    expect(
      await runWithDb(db, integrationCredentialsRepo.update(user.id,
        created.id,
        { secret: "stale" },
        env,
        created.version + 1,)),
    ).toBeUndefined();
    expect(
      await runWithDb(db, integrationCredentialsRepo.remove(user.id, created.id, created.version + 1)),
    ).toBe(false);
    expect(await runWithDb(db, integrationCredentialsRepo.get(user.id, created.id, env))).toMatchObject({
      secret: "original",
      version: 1,
    });
  });
});
