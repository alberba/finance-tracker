/** Shared seed helpers for WP6 repository integration tests. */

import { users, accounts, categories } from "../../../../src/db/schema";
import type { TestDb } from "../setup";

/** Fixed instant: seeded rows never depend on the wall clock (rule 4). */
const SEED_NOW = "2026-06-15T10:00:00.000Z";

let emailCounter = 0;

export async function seedUser(db: TestDb, email?: string) {
  emailCounter += 1;
  const now = SEED_NOW;
  const [user] = await db
    .insert(users)
    .values({
      email: email ?? `user-${emailCounter}@example.com`,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return user;
}

export async function seedAccount(db: TestDb, userId: string, overrides: Partial<{ name: string }> = {}) {
  const now = SEED_NOW;
  const [account] = await db
    .insert(accounts)
    .values({
      userId,
      name: overrides.name ?? "Cuenta corriente",
      kind: "cash",
      currency: "EUR",
      openingBalanceMinor: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return account;
}

export async function seedCategory(db: TestDb, userId: string, overrides: Partial<{ name: string; kind: string }> = {}) {
  const now = SEED_NOW;
  const [category] = await db
    .insert(categories)
    .values({
      userId,
      name: overrides.name ?? "Alimentación",
      kind: overrides.kind ?? "expense",
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return category;
}
