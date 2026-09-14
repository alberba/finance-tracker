/** `recurring_rules` repository (WP6). */

import { and, eq } from "drizzle-orm";
import { fromMinorUnits, toMinorUnits } from "../../lib/money";
import { pendingMovements, recurringRules } from "../schema";
import { assertOwnedReferences, clientIdentity, nowIso, type Db } from "./shared";

export type RecurringRuleRow = Omit<
  typeof recurringRules.$inferSelect,
  "amountMinor" | "unitPriceMinor" | "feeMinor" | "units"
> & {
  amount: number;
  /** Operation fields — present only on an investment rule. */
  units: number | null;
  unitPrice: number | null;
  fee: number | null;
};

export interface CreateRecurringRuleInput {
  /** Identity minted by the client (ADR 0001); omitted by v1-migrated writes. */
  id?: string;
  legacyId?: string | null;
  name: string;
  type: string;
  accountId?: string | null;
  categoryId?: string | null;
  amount: number;
  currency: string;
  frequency: string;
  interval?: number;
  startDate?: string | null;
  endDate?: string | null;
  lastExecutionDate?: string | null;
  nextRunDate?: string | null;
  symbol?: string | null;
  side?: string | null;
  units?: number | null;
  unitPrice?: number | null;
  fee?: number | null;
  time?: string | null;
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
  interval?: number;
  startDate?: string | null;
  endDate?: string | null;
  lastExecutionDate?: string | null;
  nextRunDate?: string | null;
  symbol?: string | null;
  side?: string | null;
  units?: number | null;
  unitPrice?: number | null;
  fee?: number | null;
  time?: string | null;
  status?: string;
}

function toRow(row: typeof recurringRules.$inferSelect): RecurringRuleRow {
  const { amountMinor, unitPriceMinor, feeMinor, units, ...rest } = row;
  return {
    ...rest,
    amount: fromMinorUnits(amountMinor, row.currency),
    units: units === null ? null : Number(units),
    unitPrice: unitPriceMinor === null ? null : fromMinorUnits(unitPriceMinor, row.currency),
    fee: feeMinor === null ? null : fromMinorUnits(feeMinor, row.currency),
  };
}

/** The operation columns, in write shape — `null` on a non-investment rule. */
function operationValues(
  input: { symbol?: string | null; side?: string | null; units?: number | null; unitPrice?: number | null; fee?: number | null; time?: string | null },
  currency: string,
) {
  return {
    symbol: input.symbol ?? null,
    side: input.side ?? null,
    units: input.units === null || input.units === undefined ? null : String(input.units),
    unitPriceMinor: input.unitPrice === null || input.unitPrice === undefined ? null : toMinorUnits(input.unitPrice, currency),
    feeMinor: input.fee === null || input.fee === undefined ? null : toMinorUnits(input.fee, currency),
    time: input.time ?? null,
  };
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
      ...clientIdentity(input.id),
      userId,
      legacyId: input.legacyId ?? null,
      name: input.name,
      type: input.type,
      accountId: input.accountId ?? null,
      categoryId: input.categoryId ?? null,
      amountMinor: toMinorUnits(input.amount, input.currency),
      currency: input.currency,
      frequency: input.frequency,
      interval: input.interval ?? 1,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      lastExecutionDate: input.lastExecutionDate ?? null,
      nextRunDate: input.nextRunDate ?? null,
      ...operationValues(input, input.currency),
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
  expectedVersion?: number,
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
      interval: input.interval ?? existing.interval,
      startDate: input.startDate === undefined ? existing.startDate : input.startDate,
      endDate: input.endDate === undefined ? existing.endDate : input.endDate,
      lastExecutionDate:
        input.lastExecutionDate === undefined ? existing.lastExecutionDate : input.lastExecutionDate,
      nextRunDate: input.nextRunDate === undefined ? existing.nextRunDate : input.nextRunDate,
      ...operationValues(
        {
          symbol: input.symbol === undefined ? existing.symbol : input.symbol,
          side: input.side === undefined ? existing.side : input.side,
          units: input.units === undefined ? existing.units : input.units,
          unitPrice: input.unitPrice === undefined ? existing.unitPrice : input.unitPrice,
          fee: input.fee === undefined ? existing.fee : input.fee,
          time: input.time === undefined ? existing.time : input.time,
        },
        nextCurrency,
      ),
      status: input.status ?? existing.status,
      updatedAt: nowIso(),
      version: existing.version + 1,
    })
    .where(and(
      eq(recurringRules.id, id),
      eq(recurringRules.userId, userId),
      expectedVersion === undefined ? undefined : eq(recurringRules.version, expectedVersion),
    ))
    .returning();
  return row ? toRow(row) : undefined;
}

export async function remove(db: Db, userId: string, id: string, expectedVersion?: number): Promise<boolean> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return false;
  }
  // A pending movement is a generated occurrence of its rule (`recurring_rule_id`
  // is NOT NULL, no ON DELETE CASCADE, and D1 always enforces it), so it goes
  // with the rule instead of blocking its removal (audit §2.6 pattern).
  await db.delete(pendingMovements).where(and(
    eq(pendingMovements.recurringRuleId, id),
    eq(pendingMovements.userId, userId),
  ));
  const deleted = await db.delete(recurringRules).where(and(
    eq(recurringRules.id, id),
    eq(recurringRules.userId, userId),
    expectedVersion === undefined ? undefined : eq(recurringRules.version, expectedVersion),
  )).returning({ id: recurringRules.id });
  return deleted.length > 0;
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
        ...clientIdentity(input.id),
        userId,
        legacyId: input.legacyId ?? null,
        name: input.name,
        type: input.type,
        accountId: input.accountId ?? null,
        categoryId: input.categoryId ?? null,
        amountMinor: toMinorUnits(input.amount, input.currency),
        currency: input.currency,
        frequency: input.frequency,
        interval: input.interval ?? 1,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        lastExecutionDate: input.lastExecutionDate ?? null,
        nextRunDate: input.nextRunDate ?? null,
        ...operationValues(input, input.currency),
        status: input.status ?? "active",
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();
  return rows.map(toRow);
}
