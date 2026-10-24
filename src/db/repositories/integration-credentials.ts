/**
 * `integration_credentials` repository (WP6, encryption wired in WP12).
 *
 * Every method here encrypts on write and decrypts on read via
 * `src/lib/server/crypto/data-encryption.ts` — callers only ever see the
 * plaintext `secret` (e.g. the Stock Events API key); the raw `ciphertext`/
 * `keyVersion` columns never leave this module. This is the only layer that
 * reads/writes the `ciphertext` column directly.
 */

import { and, eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { Database, DatabaseError, query } from '../database'
import { integrationCredentials } from '../schema'
import { nowIso, versionGuard } from './shared'
import {
  DataEncryptionError,
  decryptValue,
  encryptValue,
  type DataEncryptionEnv,
} from '../../lib/server/crypto/data-encryption'

type IntegrationCredentialTableRow = typeof integrationCredentials.$inferSelect

/** Public shape: `secret` is always the decrypted plaintext, never ciphertext. */
export interface IntegrationCredentialRow {
  id: string
  userId: string
  provider: string
  secret: string
  keyVersion: number
  createdAt: string
  updatedAt: string
  version: number
}

export interface CreateIntegrationCredentialInput {
  provider: string
  /** Plaintext secret (e.g. the Stock Events API key) — encrypted before storage. */
  secret: string
}

export interface UpdateIntegrationCredentialInput {
  /** Plaintext secret — re-encrypted (and `keyVersion` refreshed) on update. */
  secret?: string
}

function toPublicRow(
  env: DataEncryptionEnv,
  row: IntegrationCredentialTableRow,
): Effect.Effect<IntegrationCredentialRow, DataEncryptionError> {
  return Effect.gen(function* () {
    const secret = yield* decryptValue(env, {
      ciphertext: row.ciphertext,
      keyVersion: row.keyVersion,
    })
    return {
      id: row.id,
      userId: row.userId,
      provider: row.provider,
      secret,
      keyVersion: row.keyVersion,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version,
    }
  })
}

export function listByUser(
  userId: string,
  env: DataEncryptionEnv,
): Effect.Effect<IntegrationCredentialRow[], DatabaseError | DataEncryptionError, Database> {
  return Effect.gen(function* () {
    const rows = yield* query((db) =>
      db.select().from(integrationCredentials).where(eq(integrationCredentials.userId, userId)),
    )
    return yield* Effect.all(
      rows.map((row) => toPublicRow(env, row)),
      { concurrency: 'unbounded' },
    )
  })
}

export function get(
  userId: string,
  id: string,
  env: DataEncryptionEnv,
): Effect.Effect<
  IntegrationCredentialRow | undefined,
  DatabaseError | DataEncryptionError,
  Database
> {
  return Effect.gen(function* () {
    const rows = yield* query((db) =>
      db
        .select()
        .from(integrationCredentials)
        .where(and(eq(integrationCredentials.id, id), eq(integrationCredentials.userId, userId))),
    )
    const row = rows[0]
    return row ? yield* toPublicRow(env, row) : undefined
  })
}

export function getByProvider(
  userId: string,
  provider: string,
  env: DataEncryptionEnv,
): Effect.Effect<
  IntegrationCredentialRow | undefined,
  DatabaseError | DataEncryptionError,
  Database
> {
  return Effect.gen(function* () {
    const rows = yield* query((db) =>
      db
        .select()
        .from(integrationCredentials)
        .where(
          and(
            eq(integrationCredentials.userId, userId),
            eq(integrationCredentials.provider, provider),
          ),
        ),
    )
    const row = rows[0]
    return row ? yield* toPublicRow(env, row) : undefined
  })
}

/** Checks existence without decrypting or exposing credential material. */
export function hasProvider(
  userId: string,
  provider: string,
): Effect.Effect<boolean, DatabaseError, Database> {
  return query((db) =>
    db
      .select({ id: integrationCredentials.id })
      .from(integrationCredentials)
      .where(
        and(
          eq(integrationCredentials.userId, userId),
          eq(integrationCredentials.provider, provider),
        ),
      ),
  ).pipe(Effect.map((rows) => rows.length > 0))
}

export function create(
  userId: string,
  input: CreateIntegrationCredentialInput,
  env: DataEncryptionEnv,
): Effect.Effect<IntegrationCredentialRow, DatabaseError | DataEncryptionError, Database> {
  return Effect.gen(function* () {
    const now = nowIso()
    const { ciphertext, keyVersion } = yield* encryptValue(env, input.secret)
    const rows = yield* query((db) =>
      db
        .insert(integrationCredentials)
        .values({
          userId,
          provider: input.provider,
          ciphertext,
          keyVersion,
          createdAt: now,
          updatedAt: now,
        })
        .returning(),
    )
    return yield* toPublicRow(env, rows[0])
  })
}

export function update(
  userId: string,
  id: string,
  input: UpdateIntegrationCredentialInput,
  env: DataEncryptionEnv,
  expectedVersion?: number,
): Effect.Effect<
  IntegrationCredentialRow | undefined,
  DatabaseError | DataEncryptionError,
  Database
> {
  return Effect.gen(function* () {
    const existingRows = yield* query((db) =>
      db
        .select()
        .from(integrationCredentials)
        .where(and(eq(integrationCredentials.id, id), eq(integrationCredentials.userId, userId))),
    )
    const existing = existingRows[0]
    if (!existing) {
      return undefined
    }
    const next =
      input.secret !== undefined
        ? yield* encryptValue(env, input.secret)
        : { ciphertext: existing.ciphertext, keyVersion: existing.keyVersion }
    const rows = yield* query((db) =>
      db
        .update(integrationCredentials)
        .set({
          ciphertext: next.ciphertext,
          keyVersion: next.keyVersion,
          updatedAt: nowIso(),
          version: existing.version + 1,
        })
        .where(
          and(
            eq(integrationCredentials.id, id),
            eq(integrationCredentials.userId, userId),
            versionGuard(integrationCredentials.version, expectedVersion),
          ),
        )
        .returning(),
    )
    const row = rows[0]
    return row ? yield* toPublicRow(env, row) : undefined
  })
}

export function remove(
  userId: string,
  id: string,
  expectedVersion?: number,
): Effect.Effect<boolean, DatabaseError, Database> {
  return Effect.gen(function* () {
    const existingRows = yield* query((db) =>
      db
        .select()
        .from(integrationCredentials)
        .where(and(eq(integrationCredentials.id, id), eq(integrationCredentials.userId, userId))),
    )
    if (!existingRows[0]) {
      return false
    }
    const deleted = yield* query((db) =>
      db
        .delete(integrationCredentials)
        .where(
          and(
            eq(integrationCredentials.id, id),
            eq(integrationCredentials.userId, userId),
            versionGuard(integrationCredentials.version, expectedVersion),
          ),
        )
        .returning({ id: integrationCredentials.id }),
    )
    return deleted.length > 0
  })
}

export function bulkInsert(
  userId: string,
  inputs: CreateIntegrationCredentialInput[],
  env: DataEncryptionEnv,
): Effect.Effect<IntegrationCredentialRow[], DatabaseError | DataEncryptionError, Database> {
  return Effect.gen(function* () {
    if (inputs.length === 0) {
      return []
    }
    const now = nowIso()
    const encrypted = yield* Effect.all(
      inputs.map((input) => encryptValue(env, input.secret)),
      { concurrency: 'unbounded' },
    )
    const rows = yield* query((db) =>
      db
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
        .returning(),
    )
    return yield* Effect.all(
      rows.map((row) => toPublicRow(env, row)),
      { concurrency: 'unbounded' },
    )
  })
}
