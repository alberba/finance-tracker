/** `subscriptions` repository (WP6). */

import { and, eq } from "drizzle-orm";
import { fromMinorUnits, toMinorUnits } from "../../lib/money";
import { subscriptions } from "../schema";
import { assertOwnedReferences, fromFlag, nowIso, toFlag, type Db } from "./shared";

export type SubscriptionRow = Omit<
  typeof subscriptions.$inferSelect,
  "amountMinor" | "isActive"
> & { amount: number; isActive: boolean };

export interface CreateSubscriptionInput {
  legacyId?: string | null;
  name: string;
  categoryId?: string | null;
  accountId?: string | null;
  amount: number;
  currency: string;
  billingDay?: number | null;
  frequency: string;
  isActive?: boolean;
}

export interface UpdateSubscriptionInput {
  name?: string;
  categoryId?: string | null;
  accountId?: string | null;
  amount?: number;
  currency?: string;
  billingDay?: number | null;
  frequency?: string;
  isActive?: boolean;
}

function toRow(row: typeof subscriptions.$inferSelect): SubscriptionRow {
  return {
    ...row,
    amount: fromMinorUnits(row.amountMinor, row.currency),
    isActive: fromFlag(row.isActive),
  };
}

export async function listByUser(db: Db, userId: string): Promise<SubscriptionRow[]> {
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  return rows.map(toRow);
}

export async function get(db: Db, userId: string, id: string): Promise<SubscriptionRow | undefined> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)));
  return row ? toRow(row) : undefined;
}

export async function create(
  db: Db,
  userId: string,
  input: CreateSubscriptionInput,
): Promise<SubscriptionRow> {
  await assertOwnedReferences(db, userId, { accountId: input.accountId, categoryId: input.categoryId });
  const now = nowIso();
  const [row] = await db
    .insert(subscriptions)
    .values({
      userId,
      legacyId: input.legacyId ?? null,
      name: input.name,
      categoryId: input.categoryId ?? null,
      accountId: input.accountId ?? null,
      amountMinor: toMinorUnits(input.amount, input.currency),
      currency: input.currency,
      billingDay: input.billingDay ?? null,
      frequency: input.frequency,
      isActive: toFlag(input.isActive, 1),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return toRow(row);
}

export async function update(
  db: Db,
  userId: string,
  id: string,
  input: UpdateSubscriptionInput,
): Promise<SubscriptionRow | undefined> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return undefined;
  }
  await assertOwnedReferences(db, userId, { accountId: input.accountId, categoryId: input.categoryId });
  const nextCurrency = input.currency ?? existing.currency;
  const nextAmount = input.amount ?? existing.amount;
  const [row] = await db
    .update(subscriptions)
    .set({
      name: input.name ?? existing.name,
      categoryId: input.categoryId === undefined ? existing.categoryId : input.categoryId,
      accountId: input.accountId === undefined ? existing.accountId : input.accountId,
      amountMinor: toMinorUnits(nextAmount, nextCurrency),
      currency: nextCurrency,
      billingDay: input.billingDay === undefined ? existing.billingDay : input.billingDay,
      frequency: input.frequency ?? existing.frequency,
      isActive: toFlag(input.isActive, existing.isActive ? 1 : 0),
      updatedAt: nowIso(),
      version: existing.version + 1,
    })
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
    .returning();
  return toRow(row);
}

export async function remove(db: Db, userId: string, id: string): Promise<boolean> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return false;
  }
  await db.delete(subscriptions).where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)));
  return true;
}

export async function bulkInsert(
  db: Db,
  userId: string,
  inputs: CreateSubscriptionInput[],
): Promise<SubscriptionRow[]> {
  if (inputs.length === 0) {
    return [];
  }
  const now = nowIso();
  const rows = await db
    .insert(subscriptions)
    .values(
      inputs.map((input) => ({
        userId,
        legacyId: input.legacyId ?? null,
        name: input.name,
        categoryId: input.categoryId ?? null,
        accountId: input.accountId ?? null,
        amountMinor: toMinorUnits(input.amount, input.currency),
        currency: input.currency,
        billingDay: input.billingDay ?? null,
        frequency: input.frequency,
        isActive: toFlag(input.isActive, 1),
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();
  return rows.map(toRow);
}
