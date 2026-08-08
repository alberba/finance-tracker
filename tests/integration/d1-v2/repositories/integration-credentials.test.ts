import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as integrationCredentialsRepo from "../../../../src/db/repositories/integration-credentials";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "./fixtures";

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

    const created = await integrationCredentialsRepo.create(
      db,
      user.id,
      { provider: "stockevents", secret: "sk-live-plaintext" },
      env,
    );
    expect(created.keyVersion).toBe(1);
    expect(created.secret).toBe("sk-live-plaintext");

    // The raw column must never hold the plaintext.
    const raw = sqlite
      .prepare("SELECT ciphertext FROM integration_credentials WHERE id = ?")
      .get(created.id) as { ciphertext: string };
    expect(raw.ciphertext).not.toContain("sk-live-plaintext");

    const byProvider = await integrationCredentialsRepo.getByProvider(
      db,
      user.id,
      "stockevents",
      env,
    );
    expect(byProvider?.id).toBe(created.id);
    expect(byProvider?.secret).toBe("sk-live-plaintext");

    const updated = await integrationCredentialsRepo.update(
      db,
      user.id,
      created.id,
      { secret: "sk-live-rotated" },
      env,
    );
    expect(updated?.secret).toBe("sk-live-rotated");

    expect(await integrationCredentialsRepo.remove(db, user.id, created.id)).toBe(true);
  });

  it("rejects creating a credential for a non-existent user (FK violation)", async () => {
    const { db } = testDb;
    await expect(
      integrationCredentialsRepo.create(
        db,
        "does-not-exist",
        { provider: "stockevents", secret: "x" },
        env,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
  });

  it("enforces cross-user isolation", async () => {
    const { db } = testDb;
    const userA = await seedUser(db);
    const userB = await seedUser(db);
    const created = await integrationCredentialsRepo.create(
      db,
      userA.id,
      { provider: "stockevents", secret: "secret" },
      env,
    );

    expect(await integrationCredentialsRepo.get(db, userB.id, created.id, env)).toBeUndefined();
    expect(
      await integrationCredentialsRepo.getByProvider(db, userB.id, "stockevents", env),
    ).toBeUndefined();
    expect(await integrationCredentialsRepo.listByUser(db, userB.id, env)).toHaveLength(0);
  });
});
