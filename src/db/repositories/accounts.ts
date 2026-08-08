/**
 * Accounts, categories and TWR liquidity-account repository (WP6).
 *
 * Money conversion happens at this boundary (per WP2/WP6): callers pass and
 * receive plain decimal `openingBalance` floats, never the stored
 * `opening_balance_minor` integer directly.
 */

import { and, eq } from "drizzle-orm";
import { fromMinorUnits, toMinorUnits } from "../../lib/money";
import { accounts, categories, twrLiquidityAccounts } from "../schema";
import { fromFlag, nowIso, toFlag, type Db } from "./shared";

export type AccountRow = Omit<typeof accounts.$inferSelect, "openingBalanceMinor" | "isArchived"> & {
  openingBalance: number;
  isArchived: boolean;
};
export type CategoryRow = typeof categories.$inferSelect;
export type TwrLiquidityAccountRow = typeof twrLiquidityAccounts.$inferSelect;

export interface CreateAccountInput {
  legacyId?: string | null;
  name: string;
  kind: string;
  currency: string;
  openingBalance: number;
  isArchived?: boolean;
}

export interface UpdateAccountInput {
  name?: string;
  kind?: string;
  currency?: string;
  openingBalance?: number;
  isArchived?: boolean;
}

function toAccountRow(row: typeof accounts.$inferSelect): AccountRow {
  return {
    ...row,
    openingBalance: fromMinorUnits(row.openingBalanceMinor, row.currency),
    isArchived: fromFlag(row.isArchived),
  };
}

// -- accounts ----------------------------------------------------------------

export async function listByUser(db: Db, userId: string): Promise<AccountRow[]> {
  const rows = await db.select().from(accounts).where(eq(accounts.userId, userId));
  return rows.map(toAccountRow);
}

export async function get(db: Db, userId: string, id: string): Promise<AccountRow | undefined> {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  return row ? toAccountRow(row) : undefined;
}

export async function create(db: Db, userId: string, input: CreateAccountInput): Promise<AccountRow> {
  const now = nowIso();
  const [row] = await db
    .insert(accounts)
    .values({
      userId,
      legacyId: input.legacyId ?? null,
      name: input.name,
      kind: input.kind,
      currency: input.currency,
      openingBalanceMinor: toMinorUnits(input.openingBalance, input.currency),
      isArchived: toFlag(input.isArchived),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return toAccountRow(row);
}

export async function update(
  db: Db,
  userId: string,
  id: string,
  input: UpdateAccountInput,
): Promise<AccountRow | undefined> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return undefined;
  }
  const nextCurrency = input.currency ?? existing.currency;
  const nextOpeningBalance = input.openingBalance ?? existing.openingBalance;
  const [row] = await db
    .update(accounts)
    .set({
      name: input.name ?? existing.name,
      kind: input.kind ?? existing.kind,
      currency: nextCurrency,
      openingBalanceMinor: toMinorUnits(nextOpeningBalance, nextCurrency),
      isArchived: toFlag(input.isArchived, existing.isArchived ? 1 : 0),
      updatedAt: nowIso(),
      version: existing.version + 1,
    })
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .returning();
  return toAccountRow(row);
}

export async function remove(db: Db, userId: string, id: string): Promise<boolean> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return false;
  }
  await db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  return true;
}

export async function bulkInsert(
  db: Db,
  userId: string,
  inputs: CreateAccountInput[],
): Promise<AccountRow[]> {
  if (inputs.length === 0) {
    return [];
  }
  const now = nowIso();
  const rows = await db
    .insert(accounts)
    .values(
      inputs.map((input) => ({
        userId,
        legacyId: input.legacyId ?? null,
        name: input.name,
        kind: input.kind,
        currency: input.currency,
        openingBalanceMinor: toMinorUnits(input.openingBalance, input.currency),
        isArchived: toFlag(input.isArchived),
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();
  return rows.map(toAccountRow);
}

// -- categories ---------------------------------------------------------------

export interface CreateCategoryInput {
  legacyId?: string | null;
  name: string;
  kind: string;
  sortOrder?: number;
}

export interface UpdateCategoryInput {
  name?: string;
  kind?: string;
  sortOrder?: number;
}

export async function listCategoriesByUser(db: Db, userId: string): Promise<CategoryRow[]> {
  return db.select().from(categories).where(eq(categories.userId, userId));
}

export async function getCategory(db: Db, userId: string, id: string): Promise<CategoryRow | undefined> {
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)));
  return row;
}

export async function createCategory(
  db: Db,
  userId: string,
  input: CreateCategoryInput,
): Promise<CategoryRow> {
  const now = nowIso();
  const [row] = await db
    .insert(categories)
    .values({
      userId,
      legacyId: input.legacyId ?? null,
      name: input.name,
      kind: input.kind,
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

export async function updateCategory(
  db: Db,
  userId: string,
  id: string,
  input: UpdateCategoryInput,
): Promise<CategoryRow | undefined> {
  const existing = await getCategory(db, userId, id);
  if (!existing) {
    return undefined;
  }
  const [row] = await db
    .update(categories)
    .set({
      name: input.name ?? existing.name,
      kind: input.kind ?? existing.kind,
      sortOrder: input.sortOrder ?? existing.sortOrder,
      updatedAt: nowIso(),
      version: existing.version + 1,
    })
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .returning();
  return row;
}

export async function removeCategory(db: Db, userId: string, id: string): Promise<boolean> {
  const existing = await getCategory(db, userId, id);
  if (!existing) {
    return false;
  }
  await db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
  return true;
}

export async function bulkInsertCategories(
  db: Db,
  userId: string,
  inputs: CreateCategoryInput[],
): Promise<CategoryRow[]> {
  if (inputs.length === 0) {
    return [];
  }
  const now = nowIso();
  return db
    .insert(categories)
    .values(
      inputs.map((input) => ({
        userId,
        legacyId: input.legacyId ?? null,
        name: input.name,
        kind: input.kind,
        sortOrder: input.sortOrder ?? 0,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();
}

// -- twr_liquidity_accounts -----------------------------------------------------

export interface CreateTwrLiquidityAccountInput {
  legacyId?: string | null;
  accountId: string;
  name: string;
}

export async function listTwrLiquidityAccountsByUser(
  db: Db,
  userId: string,
): Promise<TwrLiquidityAccountRow[]> {
  return db.select().from(twrLiquidityAccounts).where(eq(twrLiquidityAccounts.userId, userId));
}

export async function getTwrLiquidityAccount(
  db: Db,
  userId: string,
  id: string,
): Promise<TwrLiquidityAccountRow | undefined> {
  const [row] = await db
    .select()
    .from(twrLiquidityAccounts)
    .where(and(eq(twrLiquidityAccounts.id, id), eq(twrLiquidityAccounts.userId, userId)));
  return row;
}

export async function createTwrLiquidityAccount(
  db: Db,
  userId: string,
  input: CreateTwrLiquidityAccountInput,
): Promise<TwrLiquidityAccountRow> {
  const now = nowIso();
  const [row] = await db
    .insert(twrLiquidityAccounts)
    .values({
      userId,
      legacyId: input.legacyId ?? null,
      accountId: input.accountId,
      name: input.name,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

export async function removeTwrLiquidityAccount(db: Db, userId: string, id: string): Promise<boolean> {
  const existing = await getTwrLiquidityAccount(db, userId, id);
  if (!existing) {
    return false;
  }
  await db
    .delete(twrLiquidityAccounts)
    .where(and(eq(twrLiquidityAccounts.id, id), eq(twrLiquidityAccounts.userId, userId)));
  return true;
}
