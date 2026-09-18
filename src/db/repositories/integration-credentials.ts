/**
 * `integration_credentials` repository (WP6, encryption wired in WP12).
 *
 * Every method here encrypts on write and decrypts on read via
 * `src/lib/server/crypto/data-encryption.ts` — callers only ever see the
 * plaintext `secret` (e.g. the Stock Events API key); the raw `ciphertext`/
 * `keyVersion` columns never leave this module. This is the only layer that
 * reads/writes the `ciphertext` column directly.
 */

import { and, eq } from "drizzle-orm";
import { integrationCredentials } from "../schema";
import { nowIso, type Db } from "./shared";
import {
  decryptValue,
  encryptValue,
  type DataEncryptionEnv,
} from "../../lib/server/crypto/data-encryption";

type IntegrationCredentialTableRow = typeof integrationCredentials.$inferSelect;

/** Public shape: `secret` is always the decrypted plaintext, never ciphertext. */
export interface IntegrationCredentialRow {
  id: string;
  userId: string;
  provider: string;
  secret: string;
  keyVersion: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateIntegrationCredentialInput {
  provider: string;
  /** Plaintext secret (e.g. the Stock Events API key) — encrypted before storage. */
  secret: string;
}

export interface UpdateIntegrationCredentialInput {
  /** Plaintext secret — re-encrypted (and `keyVersion` refreshed) on update. */
  secret?: string;
}

async function toPublicRow(
  env: DataEncryptionEnv,
  row: IntegrationCredentialTableRow,
): Promise<IntegrationCredentialRow> {
  const secret = await decryptValue(env, {
    ciphertext: row.ciphertext,
    keyVersion: row.keyVersion,
  });
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    secret,
    keyVersion: row.keyVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export async function listByUser(
  db: Db,
  userId: string,
  env: DataEncryptionEnv,
): Promise<IntegrationCredentialRow[]> {
  const rows = await db
    .select()
    .from(integrationCredentials)
    .where(eq(integrationCredentials.userId, userId));
  return Promise.all(rows.map((row) => toPublicRow(env, row)));
}

export async function get(
  db: Db,
  userId: string,
  id: string,
  env: DataEncryptionEnv,
): Promise<IntegrationCredentialRow | undefined> {
  const [row] = await db
    .select()
    .from(integrationCredentials)
    .where(and(eq(integrationCredentials.id, id), eq(integrationCredentials.userId, userId)));
  return row ? toPublicRow(env, row) : undefined;
}

export async function getByProvider(
  db: Db,
  userId: string,
  provider: string,
  env: DataEncryptionEnv,
): Promise<IntegrationCredentialRow | undefined> {
  const [row] = await db
    .select()
    .from(integrationCredentials)
    .where(and(eq(integrationCredentials.userId, userId), eq(integrationCredentials.provider, provider)));
  return row ? toPublicRow(env, row) : undefined;
}

/** Checks existence without decrypting or exposing credential material. */
export async function hasProvider(db: Db, userId: string, provider: string): Promise<boolean> {
  const [row] = await db
    .select({ id: integrationCredentials.id })
    .from(integrationCredentials)
    .where(and(eq(integrationCredentials.userId, userId), eq(integrationCredentials.provider, provider)));
  return row !== undefined;
}

export async function create(
  db: Db,
  userId: string,
  input: CreateIntegrationCredentialInput,
  env: DataEncryptionEnv,
): Promise<IntegrationCredentialRow> {
  const now = nowIso();
  const { ciphertext, keyVersion } = await encryptValue(env, input.secret);
  const [row] = await db
    .insert(integrationCredentials)
    .values({
      userId,
      provider: input.provider,
      ciphertext,
      keyVersion,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return toPublicRow(env, row);
}

export async function update(
  db: Db,
  userId: string,
  id: string,
  input: UpdateIntegrationCredentialInput,
  env: DataEncryptionEnv,
  expectedVersion?: number,
): Promise<IntegrationCredentialRow | undefined> {
  const [existing] = await db
    .select()
    .from(integrationCredentials)
    .where(and(eq(integrationCredentials.id, id), eq(integrationCredentials.userId, userId)));
  if (!existing) {
    return undefined;
  }
  const next =
    input.secret !== undefined
      ? await encryptValue(env, input.secret)
      : { ciphertext: existing.ciphertext, keyVersion: existing.keyVersion };
  const [row] = await db
    .update(integrationCredentials)
    .set({
      ciphertext: next.ciphertext,
      keyVersion: next.keyVersion,
      updatedAt: nowIso(),
      version: existing.version + 1,
    })
    .where(and(
      eq(integrationCredentials.id, id),
      eq(integrationCredentials.userId, userId),
      expectedVersion === undefined ? undefined : eq(integrationCredentials.version, expectedVersion),
    ))
    .returning();
  return row ? toPublicRow(env, row) : undefined;
}

export async function remove(
  db: Db,
  userId: string,
  id: string,
  expectedVersion?: number,
): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(integrationCredentials)
    .where(and(eq(integrationCredentials.id, id), eq(integrationCredentials.userId, userId)));
  if (!existing) {
    return false;
  }
  const deleted = await db
    .delete(integrationCredentials)
    .where(and(
      eq(integrationCredentials.id, id),
      eq(integrationCredentials.userId, userId),
      expectedVersion === undefined ? undefined : eq(integrationCredentials.version, expectedVersion),
    ))
    .returning({ id: integrationCredentials.id });
  return deleted.length > 0;
}

export async function bulkInsert(
  db: Db,
  userId: string,
  inputs: CreateIntegrationCredentialInput[],
  env: DataEncryptionEnv,
): Promise<IntegrationCredentialRow[]> {
  if (inputs.length === 0) {
    return [];
  }
  const now = nowIso();
  const encrypted = await Promise.all(inputs.map((input) => encryptValue(env, input.secret)));
  const rows = await db
    .insert(integrationCredentials)
    .values(
      inputs.map((input, index) => ({
        userId,
        provider: input.provider,
        ciphertext: encrypted[index].ciphertext,
        keyVersion: encrypted[index].keyVersion,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();
  return Promise.all(rows.map((row) => toPublicRow(env, row)));
}
