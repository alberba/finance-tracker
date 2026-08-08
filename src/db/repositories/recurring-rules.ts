/** `recurring_rules` repository (WP6). */

import { and, eq } from "drizzle-orm";
import { fromMinorUnits, toMinorUnits } from "../../lib/money";
import { recurringRules } from "../schema";
import { assertOwnedReferences, nowIso, type Db } from "./shared";

export type RecurringRuleRow = Omit<typeof recurringRules.$inferSelect, "amountMinor"> & {
  amount: number;
};

export interface CreateRecurringRuleInput {
  legacyId?: string | null;
  name: string;
  type: string;
  accountId?: string | null;
  categoryId?: string | null;
  amount: number;
  currency: string;
  frequency: string;
  nextRunDate?: string | null;
  status?: string;
}

export interface UpdateRecurringRuleInput {
  name?: string;
  type?: string;
  accountId?: string | null;
  categoryId?: string | null;
  amount?: number;
  currency?: string;
  frequency?: string;
  nextRunDate?: string | null;
  status?: string;
}

function toRow(row: typeof recurringRules.$inferSelect): RecurringRuleRow {
  return { ...row, amount: fromMinorUnits(row.amountMinor, row.currency) };
}

export async function listByUser(db: Db, userId: string): Promise<RecurringRuleRow[]> {
  const rows = await db.select().from(recurringRules).where(eq(recurringRules.userId, userId));
  return rows.map(toRow);
}

export async function get(db: Db, userId: string, id: string): Promise<RecurringRuleRow | undefined> {
  const [row] = await db
    .select()
    .from(recurringRules)
    .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, userId)));
  return row ? toRow(row) : undefined;
}

export async function create(
  db: Db,
  userId: string,
  input: CreateRecurringRuleInput,
): Promise<RecurringRuleRow> {
  await assertOwnedReferences(db, userId, { accountId: input.accountId, categoryId: input.categoryId });
  const now = nowIso();
  const [row] = await db
    .insert(recurringRules)
    .values({
      userId,
      legacyId: input.legacyId ?? null,
      name: input.name,
      type: input.type,
      accountId: input.accountId ?? null,
      categoryId: input.categoryId ?? null,
      amountMinor: toMinorUnits(input.amount, input.currency),
      currency: input.currency,
      frequency: input.frequency,
      nextRunDate: input.nextRunDate ?? null,
      status: input.status ?? "active",
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
  input: UpdateRecurringRuleInput,
): Promise<RecurringRuleRow | undefined> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return undefined;
  }
  await assertOwnedReferences(db, userId, { accountId: input.accountId, categoryId: input.categoryId });
  const nextCurrency = input.currency ?? existing.currency;
  const nextAmount = input.amount ?? existing.amount;
  const [row] = await db
    .update(recurringRules)
    .set({
      name: input.name ?? existing.name,
      type: input.type ?? existing.type,
      accountId: input.accountId === undefined ? existing.accountId : input.accountId,
      categoryId: input.categoryId === undefined ? existing.categoryId : input.categoryId,
      amountMinor: toMinorUnits(nextAmount, nextCurrency),
      currency: nextCurrency,
      frequency: input.frequency ?? existing.frequency,
      nextRunDate: input.nextRunDate === undefined ? existing.nextRunDate : input.nextRunDate,
      status: input.status ?? existing.status,
      updatedAt: nowIso(),
      version: existing.version + 1,
    })
    .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, userId)))
    .returning();
  return toRow(row);
}

export async function remove(db: Db, userId: string, id: string): Promise<boolean> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return false;
  }
  await db.delete(recurringRules).where(and(eq(recurringRules.id, id), eq(recurringRules.userId, userId)));
  return true;
}

export async function bulkInsert(
  db: Db,
  userId: string,
  inputs: CreateRecurringRuleInput[],
): Promise<RecurringRuleRow[]> {
  if (inputs.length === 0) {
    return [];
  }
  const now = nowIso();
  const rows = await db
    .insert(recurringRules)
    .values(
      inputs.map((input) => ({
        userId,
        legacyId: input.legacyId ?? null,
        name: input.name,
        type: input.type,
        accountId: input.accountId ?? null,
        categoryId: input.categoryId ?? null,
        amountMinor: toMinorUnits(input.amount, input.currency),
        currency: input.currency,
        frequency: input.frequency,
        nextRunDate: input.nextRunDate ?? null,
        status: input.status ?? "active",
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();
  return rows.map(toRow);
}
