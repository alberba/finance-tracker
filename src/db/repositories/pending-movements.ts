/** `pending_movements` repository (WP6) — generated, not-yet-confirmed recurring occurrences. */

import { and, eq } from "drizzle-orm";
import { fromMinorUnits, toMinorUnits } from "../../lib/money";
import { pendingMovements } from "../schema";
import { type Db, RejectedCommandError, assertOwnedReferences, assertSavingAccounts, clientIdentity, nowIso, versionGuard } from "./shared";

export type PendingMovementRow = Omit<
  typeof pendingMovements.$inferSelect,
  "amountMinor" | "unitPriceMinor" | "feeMinor" | "units"
> & {
  amount: number;
  /** Operation fields — present only on an investment occurrence. */
  units: number | null;
  unitPrice: number | null;
  fee: number | null;
};

export interface CreatePendingMovementInput {
  /** Identity minted by the client (ADR 0001); omitted by v1-migrated writes. */
  id?: string;
  legacyId?: string | null;
  recurringRuleId: string;
  accountId?: string | null;
  destinationAccountId?: string | null;
  categoryId?: string | null;
  amount: number;
  currency: string;
  dueDate: string;
  type?: string | null;
  description?: string | null;
  symbol?: string | null;
  side?: string | null;
  units?: number | null;
  unitPrice?: number | null;
  fee?: number | null;
  time?: string | null;
  transactionId?: string | null;
  status?: string;
}

export interface UpdatePendingMovementInput {
  accountId?: string | null;
  destinationAccountId?: string | null;
  categoryId?: string | null;
  amount?: number;
  currency?: string;
  dueDate?: string;
  type?: string | null;
  description?: string | null;
  symbol?: string | null;
  side?: string | null;
  units?: number | null;
  unitPrice?: number | null;
  fee?: number | null;
  time?: string | null;
  transactionId?: string | null;
  status?: string;
}

function toRow(row: typeof pendingMovements.$inferSelect): PendingMovementRow {
  const { amountMinor, unitPriceMinor, feeMinor, units, ...rest } = row;
  return {
    ...rest,
    amount: fromMinorUnits(amountMinor, row.currency),
    units: units === null ? null : Number(units),
    unitPrice: unitPriceMinor === null ? null : fromMinorUnits(unitPriceMinor, row.currency),
    fee: feeMinor === null ? null : fromMinorUnits(feeMinor, row.currency),
  };
}

/** The movement-template columns beyond amount/date, in write shape. */
function templateValues(
  input: {
    type?: string | null;
    description?: string | null;
    symbol?: string | null;
    side?: string | null;
    units?: number | null;
    unitPrice?: number | null;
    fee?: number | null;
    time?: string | null;
    transactionId?: string | null;
  },
  currency: string,
) {
  return {
    type: input.type ?? null,
    description: input.description ?? null,
    symbol: input.symbol ?? null,
    side: input.side ?? null,
    units: input.units === null || input.units === undefined ? null : String(input.units),
    unitPriceMinor: input.unitPrice === null || input.unitPrice === undefined ? null : toMinorUnits(input.unitPrice, currency),
    feeMinor: input.fee === null || input.fee === undefined ? null : toMinorUnits(input.fee, currency),
    time: input.time ?? null,
    transactionId: input.transactionId ?? null,
  };
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
  const destinationAccountId = input.type === "saving" ? (input.destinationAccountId ?? null) : null;
  if (input.type === "saving") {
    if (!destinationAccountId) {
      throw new RejectedCommandError("El ahorro necesita una cuenta destino.");
    }
    await assertSavingAccounts(db, userId, { accountId: input.accountId, destinationAccountId });
  }
  const now = nowIso();
  const [row] = await db
    .insert(pendingMovements)
    .values({
      ...clientIdentity(input.id),
      userId,
      legacyId: input.legacyId ?? null,
      recurringRuleId: input.recurringRuleId,
      accountId: input.accountId ?? null,
      destinationAccountId,
      categoryId: input.categoryId ?? null,
      amountMinor: toMinorUnits(input.amount, input.currency),
      currency: input.currency,
      dueDate: input.dueDate,
      ...templateValues(input, input.currency),
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
  expectedVersion?: number,
): Promise<PendingMovementRow | undefined> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return undefined;
  }
  await assertOwnedReferences(db, userId, { accountId: input.accountId, categoryId: input.categoryId });
  const nextCurrency = input.currency ?? existing.currency;
  const nextAmount = input.amount ?? existing.amount;
  const nextType = input.type === undefined ? existing.type : input.type;
  const nextAccountId = input.accountId === undefined ? existing.accountId : input.accountId;
  const nextDestination =
    nextType !== "saving"
      ? null
      : input.destinationAccountId === undefined
        ? existing.destinationAccountId
        : input.destinationAccountId;
  if (nextType === "saving") {
    if (!nextDestination) {
      throw new RejectedCommandError("El ahorro necesita una cuenta destino.");
    }
    await assertSavingAccounts(db, userId, { accountId: nextAccountId, destinationAccountId: nextDestination });
  }
  const [row] = await db
    .update(pendingMovements)
    .set({
      accountId: nextAccountId,
      destinationAccountId: nextDestination,
      categoryId: input.categoryId === undefined ? existing.categoryId : input.categoryId,
      amountMinor: toMinorUnits(nextAmount, nextCurrency),
      currency: nextCurrency,
      dueDate: input.dueDate ?? existing.dueDate,
      ...templateValues(
        {
          type: nextType,
          description: input.description === undefined ? existing.description : input.description,
          symbol: input.symbol === undefined ? existing.symbol : input.symbol,
          side: input.side === undefined ? existing.side : input.side,
          units: input.units === undefined ? existing.units : input.units,
          unitPrice: input.unitPrice === undefined ? existing.unitPrice : input.unitPrice,
          fee: input.fee === undefined ? existing.fee : input.fee,
          time: input.time === undefined ? existing.time : input.time,
          transactionId: input.transactionId === undefined ? existing.transactionId : input.transactionId,
        },
        nextCurrency,
      ),
      status: input.status ?? existing.status,
      updatedAt: nowIso(),
      version: existing.version + 1,
    })
    .where(and(
      eq(pendingMovements.id, id),
      eq(pendingMovements.userId, userId),
      versionGuard(pendingMovements.version, expectedVersion),
    ))
    .returning();
  return row ? toRow(row) : undefined;
}

export async function remove(db: Db, userId: string, id: string, expectedVersion?: number): Promise<boolean> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return false;
  }
  const deleted = await db
    .delete(pendingMovements)
    .where(and(
      eq(pendingMovements.id, id),
      eq(pendingMovements.userId, userId),
      versionGuard(pendingMovements.version, expectedVersion),
    ))
    .returning({ id: pendingMovements.id });
  return deleted.length > 0;
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
        ...clientIdentity(input.id),
        userId,
        legacyId: input.legacyId ?? null,
        recurringRuleId: input.recurringRuleId,
        accountId: input.accountId ?? null,
        categoryId: input.categoryId ?? null,
        amountMinor: toMinorUnits(input.amount, input.currency),
        currency: input.currency,
        dueDate: input.dueDate,
        ...templateValues(input, input.currency),
        status: input.status ?? "pending",
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();
  return rows.map(toRow);
}
