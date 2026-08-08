/** `pending_movements` repository (WP6) — generated, not-yet-confirmed recurring occurrences. */

import { and, eq } from "drizzle-orm";
import { fromMinorUnits, toMinorUnits } from "../../lib/money";
import { pendingMovements } from "../schema";
import { assertOwnedReferences, nowIso, type Db } from "./shared";

export type PendingMovementRow = Omit<typeof pendingMovements.$inferSelect, "amountMinor"> & {
  amount: number;
};

export interface CreatePendingMovementInput {
  legacyId?: string | null;
  recurringRuleId: string;
  accountId?: string | null;
  categoryId?: string | null;
  amount: number;
  currency: string;
  dueDate: string;
  status?: string;
}

export interface UpdatePendingMovementInput {
  accountId?: string | null;
  categoryId?: string | null;
  amount?: number;
  currency?: string;
  dueDate?: string;
  status?: string;
}

function toRow(row: typeof pendingMovements.$inferSelect): PendingMovementRow {
  return { ...row, amount: fromMinorUnits(row.amountMinor, row.currency) };
}

export async function listByUser(db: Db, userId: string): Promise<PendingMovementRow[]> {
  const rows = await db.select().from(pendingMovements).where(eq(pendingMovements.userId, userId));
  return rows.map(toRow);
}

export async function get(db: Db, userId: string, id: string): Promise<PendingMovementRow | undefined> {
  const [row] = await db
    .select()
    .from(pendingMovements)
    .where(and(eq(pendingMovements.id, id), eq(pendingMovements.userId, userId)));
  return row ? toRow(row) : undefined;
}

export async function create(
  db: Db,
  userId: string,
  input: CreatePendingMovementInput,
): Promise<PendingMovementRow> {
  await assertOwnedReferences(db, userId, {
    accountId: input.accountId,
    categoryId: input.categoryId,
    recurringRuleId: input.recurringRuleId,
  });
  const now = nowIso();
  const [row] = await db
    .insert(pendingMovements)
    .values({
      userId,
      legacyId: input.legacyId ?? null,
      recurringRuleId: input.recurringRuleId,
      accountId: input.accountId ?? null,
      categoryId: input.categoryId ?? null,
      amountMinor: toMinorUnits(input.amount, input.currency),
      currency: input.currency,
      dueDate: input.dueDate,
      status: input.status ?? "pending",
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
  input: UpdatePendingMovementInput,
): Promise<PendingMovementRow | undefined> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return undefined;
  }
  await assertOwnedReferences(db, userId, { accountId: input.accountId, categoryId: input.categoryId });
  const nextCurrency = input.currency ?? existing.currency;
  const nextAmount = input.amount ?? existing.amount;
  const [row] = await db
    .update(pendingMovements)
    .set({
      accountId: input.accountId === undefined ? existing.accountId : input.accountId,
      categoryId: input.categoryId === undefined ? existing.categoryId : input.categoryId,
      amountMinor: toMinorUnits(nextAmount, nextCurrency),
      currency: nextCurrency,
      dueDate: input.dueDate ?? existing.dueDate,
      status: input.status ?? existing.status,
      updatedAt: nowIso(),
      version: existing.version + 1,
    })
    .where(and(eq(pendingMovements.id, id), eq(pendingMovements.userId, userId)))
    .returning();
  return toRow(row);
}

export async function remove(db: Db, userId: string, id: string): Promise<boolean> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return false;
  }
  await db
    .delete(pendingMovements)
    .where(and(eq(pendingMovements.id, id), eq(pendingMovements.userId, userId)));
  return true;
}

export async function bulkInsert(
  db: Db,
  userId: string,
  inputs: CreatePendingMovementInput[],
): Promise<PendingMovementRow[]> {
  if (inputs.length === 0) {
    return [];
  }
  const now = nowIso();
  const rows = await db
    .insert(pendingMovements)
    .values(
      inputs.map((input) => ({
        userId,
        legacyId: input.legacyId ?? null,
        recurringRuleId: input.recurringRuleId,
        accountId: input.accountId ?? null,
        categoryId: input.categoryId ?? null,
        amountMinor: toMinorUnits(input.amount, input.currency),
        currency: input.currency,
        dueDate: input.dueDate,
        status: input.status ?? "pending",
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();
  return rows.map(toRow);
}
