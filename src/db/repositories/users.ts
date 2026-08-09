/**
 * Users + user identities repository (WP6).
 *
 * `users.id` IS the tenant identity that every other table's `user_id` FKs
 * to (see `src/db/schema/users.ts`), so unlike every other repository in
 * this directory there is no *other* user to scope `users` rows by. Identity
 * provisioning logic itself (first-auth create, legacy-owner linking) lives
 * in WP3's `src/lib/server/auth/*` — this module only exposes the CRUD
 * surface those callers (and WP9's migration tool) need.
 */

import { and, eq } from "drizzle-orm";
import { users, userIdentities } from "../schema";
import { normalizeEmail, nowIso, type Db } from "./shared";

export type UserRow = typeof users.$inferSelect;
export type UserIdentityRow = typeof userIdentities.$inferSelect;

export interface CreateUserInput {
  email: string;
  displayName?: string | null;
  isLegacyOwner?: boolean;
}

export interface UpdateUserInput {
  displayName?: string | null;
}

export interface CreateUserIdentityInput {
  provider: string;
  subject: string;
  email?: string | null;
}

export async function get(db: Db, id: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row;
}

export async function getByEmail(db: Db, email: string): Promise<UserRow | undefined> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)));
  return row;
}

export async function create(db: Db, input: CreateUserInput): Promise<UserRow> {
  const now = nowIso();
  const [row] = await db
    .insert(users)
    .values({
      email: normalizeEmail(input.email),
      displayName: input.displayName ?? null,
      isLegacyOwner: input.isLegacyOwner ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

export async function update(db: Db, id: string, input: UpdateUserInput): Promise<UserRow | undefined> {
  const existing = await get(db, id);
  if (!existing) {
    return undefined;
  }
  const [row] = await db
    .update(users)
    .set({
      displayName: input.displayName === undefined ? existing.displayName : input.displayName,
      updatedAt: nowIso(),
    })
    .where(eq(users.id, id))
    .returning();
  return row;
}

export async function remove(db: Db, id: string): Promise<boolean> {
  const existing = await get(db, id);
  if (!existing) {
    return false;
  }
  await db.delete(users).where(eq(users.id, id));
  return true;
}

export async function bulkInsert(db: Db, inputs: CreateUserInput[]): Promise<UserRow[]> {
  if (inputs.length === 0) {
    return [];
  }
  const now = nowIso();
  return db
    .insert(users)
    .values(
      inputs.map((input) => ({
        email: normalizeEmail(input.email),
        displayName: input.displayName ?? null,
        isLegacyOwner: input.isLegacyOwner ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();
}

// -- user_identities --------------------------------------------------------

export async function listIdentitiesByUser(db: Db, userId: string): Promise<UserIdentityRow[]> {
  return db.select().from(userIdentities).where(eq(userIdentities.userId, userId));
}

export async function getIdentity(
  db: Db,
  userId: string,
  id: string,
): Promise<UserIdentityRow | undefined> {
  const [row] = await db
    .select()
    .from(userIdentities)
    .where(and(eq(userIdentities.id, id), eq(userIdentities.userId, userId)));
  return row;
}

/** Global lookup by `(provider, subject)` — used by WP3 before a `userId` is known. */
export async function getIdentityByProviderSubject(
  db: Db,
  provider: string,
  subject: string,
): Promise<UserIdentityRow | undefined> {
  const [row] = await db
    .select()
    .from(userIdentities)
    .where(and(eq(userIdentities.provider, provider), eq(userIdentities.subject, subject)));
  return row;
}

export async function createIdentity(
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
    .returning();
  return row;
}

export async function removeIdentity(db: Db, userId: string, id: string): Promise<boolean> {
  const existing = await getIdentity(db, userId, id);
  if (!existing) {
    return false;
  }
  await db.delete(userIdentities).where(and(eq(userIdentities.id, id), eq(userIdentities.userId, userId)));
  return true;
}
