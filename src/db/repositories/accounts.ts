/**
 * Accounts, categories and TWR liquidity-account repository (WP6).
 *
 * Money conversion happens at this boundary (per WP2/WP6): callers pass and
 * receive plain decimal `openingBalance` floats, never the stored
 * `opening_balance_minor` integer directly.
 */

import { and, eq } from "drizzle-orm";
import { fromMinorUnits, toMinorUnits } from "../../lib/money";
import {
  accounts,
  budgetEntries,
  categories,
  contributionAllocations,
  pendingMovements,
  recurringRules,
  snapshotBalances,
  stockeventsSymbolMappings,
  subscriptions,
  transactions,
  twrLiquidityAccounts,
  userInstruments,
} from "../schema";
import { assertOwnedReferences, clientIdentity, fromFlag, nowIso, RejectedCommandError, toFlag, type Db } from "./shared";

/**
 * No FK in the v2 DDL cascades and D1 always enforces them, so deleting a
 * still-referenced account/category would fail with a raw constraint error.
 * Rejecting it up front keeps the sync queue moving (audit §2.6).
 */
async function isReferenced(
  db: Db,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any table with `userId` + the referencing column
  refs: Array<{ table: any; column: any }>,
  id: string,
): Promise<boolean> {
  for (const { table, column } of refs) {
    const [row] = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(column, id), eq(table.userId, userId)))
      .limit(1);
    if (row) return true;
  }
  return false;
}

export type AccountRow = Omit<typeof accounts.$inferSelect, "openingBalanceMinor" | "isArchived"> & {
  openingBalance: number;
  isArchived: boolean;
};
export type CategoryRow = typeof categories.$inferSelect;
export type TwrLiquidityAccountRow = typeof twrLiquidityAccounts.$inferSelect;

export interface CreateAccountInput {
  /** Identity minted by the client (ADR 0001); omitted by v1-migrated writes. */
  id?: string;
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
      ...clientIdentity(input.id),
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
  expectedVersion?: number,
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
    .where(and(
      eq(accounts.id, id),
      eq(accounts.userId, userId),
      expectedVersion === undefined ? undefined : eq(accounts.version, expectedVersion),
    ))
    .returning();
  return row ? toAccountRow(row) : undefined;
}

export async function remove(db: Db, userId: string, id: string, expectedVersion?: number): Promise<boolean> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return false;
  }
  const inUse = await isReferenced(db, userId, [
    { table: transactions, column: transactions.accountId },
    { table: pendingMovements, column: pendingMovements.accountId },
    { table: recurringRules, column: recurringRules.accountId },
    { table: subscriptions, column: subscriptions.accountId },
    { table: twrLiquidityAccounts, column: twrLiquidityAccounts.accountId },
    { table: contributionAllocations, column: contributionAllocations.accountId },
    { table: snapshotBalances, column: snapshotBalances.accountId },
  ], id);
  if (inUse) {
    throw new RejectedCommandError("La cuenta tiene movimientos u otros datos asociados y no se puede eliminar.");
  }
  const deleted = await db.delete(accounts).where(and(
    eq(accounts.id, id),
    eq(accounts.userId, userId),
    expectedVersion === undefined ? undefined : eq(accounts.version, expectedVersion),
  )).returning({ id: accounts.id });
  return deleted.length > 0;
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
        ...clientIdentity(input.id),
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
  /** Identity minted by the client (ADR 0001); omitted by v1-migrated writes. */
  id?: string;
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
      ...clientIdentity(input.id),
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
  expectedVersion?: number,
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
    .where(and(
      eq(categories.id, id),
      eq(categories.userId, userId),
      expectedVersion === undefined ? undefined : eq(categories.version, expectedVersion),
    ))
    .returning();
  return row;
}

export async function removeCategory(
  db: Db,
  userId: string,
  id: string,
  expectedVersion?: number,
): Promise<boolean> {
  const existing = await getCategory(db, userId, id);
  if (!existing) {
    return false;
  }
  const inUse = await isReferenced(db, userId, [
    { table: transactions, column: transactions.categoryId },
    { table: pendingMovements, column: pendingMovements.categoryId },
    { table: recurringRules, column: recurringRules.categoryId },
    { table: subscriptions, column: subscriptions.categoryId },
    { table: budgetEntries, column: budgetEntries.categoryId },
    { table: userInstruments, column: userInstruments.categoryId },
    { table: stockeventsSymbolMappings, column: stockeventsSymbolMappings.categoryId },
  ], id);
  if (inUse) {
    throw new RejectedCommandError("La categoría está en uso y no se puede eliminar.");
  }
  const deleted = await db.delete(categories).where(and(
    eq(categories.id, id),
    eq(categories.userId, userId),
    expectedVersion === undefined ? undefined : eq(categories.version, expectedVersion),
  )).returning({ id: categories.id });
  return deleted.length > 0;
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
        ...clientIdentity(input.id),
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
  await assertOwnedReferences(db, userId, { accountId: input.accountId });
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
