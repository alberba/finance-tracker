import { describe, expect, it } from "vitest";
import {
  DataEncryptionError,
  decryptValue,
  encryptValue,
  resolveActiveKeyVersion,
  type DataEncryptionEnv,
} from "../../../src/lib/server/crypto/data-encryption";
import * as integrationCredentialsRepo from "../../../src/db/repositories/integration-credentials";
import { createTestDb } from "../../integration/d1-v2/setup";
import { seedUser } from "../../integration/d1-v2/repositories/fixtures";
import { runWithDb } from '../../../src/db/database'

const KEY_V1 = "jczGrUcJ9753I5noa+t5lM2U28P2WYQsgwABKiOwguQ=";
const KEY_V2 = "JX8Y+UGqW+nn5hY5k1N3Cw+Dw9MInwL6F1fDbkTVRIw=";

const PLAINTEXT = "sk-live-super-secret-stockevents-key";

describe("data-encryption (WP12)", () => {
  it("round-trips plaintext through encrypt/decrypt", async () => {
    const env: DataEncryptionEnv = { DATA_ENCRYPTION_KEY: KEY_V1 };
    const envelope = await encryptValue(env, PLAINTEXT);
    expect(envelope.keyVersion).toBe(1);
    const decrypted = await decryptValue(env, envelope);
    expect(decrypted).toBe(PLAINTEXT);
  });

  it("never stores the plaintext inside the ciphertext envelope", async () => {
    const env: DataEncryptionEnv = { DATA_ENCRYPTION_KEY: KEY_V1 };
    const envelope = await encryptValue(env, PLAINTEXT);
    expect(envelope.ciphertext).not.toContain(PLAINTEXT);
    expect(JSON.stringify(envelope)).not.toContain(PLAINTEXT);
  });

  it("produces a different ciphertext for the same plaintext each time (random IV)", async () => {
    const env: DataEncryptionEnv = { DATA_ENCRYPTION_KEY: KEY_V1 };
    const first = await encryptValue(env, PLAINTEXT);
    const second = await encryptValue(env, PLAINTEXT);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(await decryptValue(env, first)).toBe(PLAINTEXT);
    expect(await decryptValue(env, second)).toBe(PLAINTEXT);
  });

  it("fails to decrypt with the wrong key", async () => {
    const envelope = await encryptValue({ DATA_ENCRYPTION_KEY: KEY_V1 }, PLAINTEXT);
    await expect(
      decryptValue({ DATA_ENCRYPTION_KEY: KEY_V2 }, envelope),
    ).rejects.toThrow(DataEncryptionError);
  });

  it("rejects a tampered ciphertext (GCM auth tag mismatch)", async () => {
    const env: DataEncryptionEnv = { DATA_ENCRYPTION_KEY: KEY_V1 };
    const envelope = await encryptValue(env, PLAINTEXT);
    const [ivPart, cipherPart] = envelope.ciphertext.split(".");
    const tampered = cipherPart.slice(0, -2) + (cipherPart.at(-2) === "A" ? "B" : "A") + cipherPart.at(-1);
    await expect(
      decryptValue(env, { ciphertext: `${ivPart}.${tampered}`, keyVersion: envelope.keyVersion }),
    ).rejects.toThrow(DataEncryptionError);
  });

  describe("key-version rotation", () => {
    it("resolves the active version from DATA_ENCRYPTION_KEY_VERSION, defaulting to 1", () => {
      expect(resolveActiveKeyVersion({})).toBe(1);
      expect(resolveActiveKeyVersion({ DATA_ENCRYPTION_KEY_VERSION: "3" })).toBe(3);
    });

    it("encrypts new values under the active (rotated) key version", async () => {
      const rotatedEnv: DataEncryptionEnv = {
        DATA_ENCRYPTION_KEY: KEY_V2,
        DATA_ENCRYPTION_KEY_PREVIOUS: KEY_V1,
        DATA_ENCRYPTION_KEY_VERSION: "2",
      };
      const envelope = await encryptValue(rotatedEnv, PLAINTEXT);
      expect(envelope.keyVersion).toBe(2);
      expect(await decryptValue(rotatedEnv, envelope)).toBe(PLAINTEXT);
    });

    it("still decrypts values encrypted under the previous key after rotation", async () => {
      const preRotation: DataEncryptionEnv = {
        DATA_ENCRYPTION_KEY: KEY_V1,
        DATA_ENCRYPTION_KEY_VERSION: "1",
      };
      const oldEnvelope = await encryptValue(preRotation, PLAINTEXT);

      const postRotation: DataEncryptionEnv = {
        DATA_ENCRYPTION_KEY: KEY_V2,
        DATA_ENCRYPTION_KEY_PREVIOUS: KEY_V1,
        DATA_ENCRYPTION_KEY_VERSION: "2",
      };
      expect(await decryptValue(postRotation, oldEnvelope)).toBe(PLAINTEXT);

      const newEnvelope = await encryptValue(postRotation, PLAINTEXT);
      expect(newEnvelope.keyVersion).toBe(2);
    });

    it("throws when no key material exists for the requested version", async () => {
      const envelope = await encryptValue({ DATA_ENCRYPTION_KEY: KEY_V1 }, PLAINTEXT);
      const noPreviousKeyEnv: DataEncryptionEnv = {
        DATA_ENCRYPTION_KEY: KEY_V2,
        DATA_ENCRYPTION_KEY_VERSION: "2",
        // no DATA_ENCRYPTION_KEY_PREVIOUS configured
      };
      await expect(decryptValue(noPreviousKeyEnv, envelope)).rejects.toThrow(DataEncryptionError);
    });
  });

  it("rejects a key that isn't 32 bytes once decoded", async () => {
    await expect(
      encryptValue({ DATA_ENCRYPTION_KEY: Buffer.from("too-short").toString("base64") }, PLAINTEXT),
    ).rejects.toThrow(DataEncryptionError);
  });
});

describe("integration-credentials repository ciphertext at rest (WP12)", () => {
  const env: DataEncryptionEnv = { DATA_ENCRYPTION_KEY: KEY_V1 };

  it("never persists the plaintext secret in the ciphertext column", async () => {
    const { db, sqlite, close } = createTestDb();
    try {
      const user = await seedUser(db);
      const created = await runWithDb(db, integrationCredentialsRepo.create(user.id,
        { provider: "stockevents", secret: PLAINTEXT },
        env,));

      const raw = sqlite
        .prepare("SELECT ciphertext, key_version FROM integration_credentials WHERE id = ?")
        .get(created.id) as { ciphertext: string; key_version: number };

      expect(raw.ciphertext).not.toContain(PLAINTEXT);
      expect(JSON.stringify(raw)).not.toContain(PLAINTEXT);
      expect(raw.key_version).toBe(1);

      // Decrypted read path returns the original plaintext.
      const fetched = await runWithDb(db, integrationCredentialsRepo.getByProvider(user.id,
        "stockevents",
        env,));
      expect(fetched?.secret).toBe(PLAINTEXT);
    } finally {
      close();
    }
  });

  it("re-encrypts on update, replacing the stored ciphertext", async () => {
    const { db, sqlite, close } = createTestDb();
    try {
      const user = await seedUser(db);
      const created = await runWithDb(db, integrationCredentialsRepo.create(user.id,
        { provider: "stockevents", secret: PLAINTEXT },
        env,));
      const firstCiphertext = (
        sqlite
          .prepare("SELECT ciphertext FROM integration_credentials WHERE id = ?")
          .get(created.id) as { ciphertext: string }
      ).ciphertext;

      const updated = await runWithDb(db, integrationCredentialsRepo.update(user.id,
        created.id,
        { secret: "rotated-secret" },
        env,));
      expect(updated?.secret).toBe("rotated-secret");

      const secondCiphertext = (
        sqlite
          .prepare("SELECT ciphertext FROM integration_credentials WHERE id = ?")
          .get(created.id) as { ciphertext: string }
      ).ciphertext;
      expect(secondCiphertext).not.toBe(firstCiphertext);
      expect(secondCiphertext).not.toContain("rotated-secret");
    } finally {
      close();
    }
  });
});
