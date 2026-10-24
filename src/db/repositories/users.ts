/**
 * Users + user identities repository (WP6).
 *
 * `users.id` IS the tenant identity that every other table's `user_id` FKs
 * to (see `src/db/schema/users.ts`), so unlike every other repository in
 * this directory there is no *other* user to scope `users` rows by. Identity
 * provisioning lives in the authentication boundary; this module exposes
 * identity CRUD without privileges derived from migration status.
 */

import { and, eq } from 'drizzle-orm'
import { lift } from '../database'
import { users, userIdentities } from '../schema'
import { normalizeEmail, nowIso, type Db } from './shared'

export type UserRow = typeof users.$inferSelect
export type UserIdentityRow = typeof userIdentities.$inferSelect

export interface CreateUserInput {
  email: string
  displayName?: string | null
}

export interface UpdateUserInput {
  displayName?: string | null
}

export interface CreateUserIdentityInput {
  provider: string
  subject: string
  email?: string | null
}

async function getSql(db: Db, id: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id))
  return row
}

async function getByEmailSql(db: Db, email: string): Promise<UserRow | undefined> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
  return row
}

async function createSql(db: Db, input: CreateUserInput): Promise<UserRow> {
  const now = nowIso()
  const [row] = await db
    .insert(users)
    .values({
      email: normalizeEmail(input.email),
      displayName: input.displayName ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  return row
}

async function updateSql(db: Db, id: string, input: UpdateUserInput): Promise<UserRow | undefined> {
  const existing = await getSql(db, id)
  if (!existing) {
    return undefined
  }
  const [row] = await db
    .update(users)
    .set({
      displayName: input.displayName === undefined ? existing.displayName : input.displayName,
      updatedAt: nowIso(),
    })
    .where(eq(users.id, id))
    .returning()
  return row
}

async function removeSql(db: Db, id: string): Promise<boolean> {
  const existing = await getSql(db, id)
  if (!existing) {
    return false
  }
  await db.delete(users).where(eq(users.id, id))
  return true
}

async function bulkInsertSql(db: Db, inputs: CreateUserInput[]): Promise<UserRow[]> {
  if (inputs.length === 0) {
    return []
  }
  const now = nowIso()
  return db
    .insert(users)
    .values(
      inputs.map((input) => ({
        email: normalizeEmail(input.email),
        displayName: input.displayName ?? null,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning()
}

// -- user_identities --------------------------------------------------------

async function listIdentitiesByUserSql(db: Db, userId: string): Promise<UserIdentityRow[]> {
  return db.select().from(userIdentities).where(eq(userIdentities.userId, userId))
}

async function getIdentitySql(
  db: Db,
  userId: string,
  id: string,
): Promise<UserIdentityRow | undefined> {
  const [row] = await db
    .select()
    .from(userIdentities)
    .where(and(eq(userIdentities.id, id), eq(userIdentities.userId, userId)))
  return row
}

/** Global lookup by `(provider, subject)` — used by WP3 before a `userId` is known. */
async function getIdentityByProviderSubjectSql(
  db: Db,
  provider: string,
  subject: string,
): Promise<UserIdentityRow | undefined> {
  const [row] = await db
    .select()
    .from(userIdentities)
    .where(and(eq(userIdentities.provider, provider), eq(userIdentities.subject, subject)))
  return row
}

async function createIdentitySql(
  db: Db,
  userId: string,
  input: CreateUserIdentityInput,
): Promise<UserIdentityRow> {
  const [row] = await db
    .insert(userIdentities)
    .values({
      userId,
      provider: input.provider,
      subject: input.subject,
      email: input.email ? normalizeEmail(input.email) : null,
      createdAt: nowIso(),
    })
    .returning()
  return row
}

async function removeIdentitySql(db: Db, userId: string, id: string): Promise<boolean> {
  const existing = await getIdentitySql(db, userId, id)
  if (!existing) {
    return false
  }
  await db
    .delete(userIdentities)
    .where(and(eq(userIdentities.id, id), eq(userIdentities.userId, userId)))
  return true
}

export const get = lift(getSql)
export const getByEmail = lift(getByEmailSql)
export const create = lift(createSql)
export const update = lift(updateSql)
export const remove = lift(removeSql)
export const bulkInsert = lift(bulkInsertSql)
export const listIdentitiesByUser = lift(listIdentitiesByUserSql)
export const getIdentity = lift(getIdentitySql)
export const getIdentityByProviderSubject = lift(getIdentityByProviderSubjectSql)
export const createIdentity = lift(createIdentitySql)
export const removeIdentity = lift(removeIdentitySql)
