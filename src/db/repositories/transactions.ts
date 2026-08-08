/**
 * Transactions + investment-trade-detail extension repository (WP6).
 *
 * `investmentTradeDetails.quantity` is a decimal string, not a minimal-unit
 * money column (see `src/db/schema/transactions.ts`), so it passes through
 * unconverted; `priceMinor`/`feeMinor` go through the money boundary like
 * every other amount column.
 */

import { and, eq } from "drizzle-orm";
import { fromMinorUnits, toMinorUnits } from "../../lib/money";
import { investmentTradeDetails, transactions } from "../schema";
import { assertOwnedReferences, nowIso, type Db } from "./shared";

export type TransactionRow = Omit<typeof transactions.$inferSelect, "amountMinor"> & {
  amount: number;
};
export type InvestmentTradeDetailRow = Omit<
  typeof investmentTradeDetails.$inferSelect,
  "priceMinor" | "feeMinor"
> & {
  price: number;
  fee: number;
};

export interface CreateTransactionInput {
  legacyId?: string | null;
  accountId: string;
  categoryId?: string | null;
  type: string;
  date: string;
  description?: string | null;
  amount: number;
  currency: string;
}

export interface UpdateTransactionInput {
  accountId?: string;
  categoryId?: string | null;
  type?: string;
  date?: string;
  description?: string | null;
  amount?: number;
  currency?: string;
}

function toTransactionRow(row: typeof transactions.$inferSelect): TransactionRow {
  return { ...row, amount: fromMinorUnits(row.amountMinor, row.currency) };
}

export async function listByUser(db: Db, userId: string): Promise<TransactionRow[]> {
  const rows = await db.select().from(transactions).where(eq(transactions.userId, userId));
  return rows.map(toTransactionRow);
}

export async function get(db: Db, userId: string, id: string): Promise<TransactionRow | undefined> {
  const [row] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  return row ? toTransactionRow(row) : undefined;
}

export async function create(
  db: Db,
  userId: string,
  input: CreateTransactionInput,
): Promise<TransactionRow> {
  await assertOwnedReferences(db, userId, { accountId: input.accountId, categoryId: input.categoryId });
  const now = nowIso();
  const [row] = await db
    .insert(transactions)
    .values({
      userId,
      legacyId: input.legacyId ?? null,
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      type: input.type,
      date: input.date,
      description: input.description ?? null,
      amountMinor: toMinorUnits(input.amount, input.currency),
      currency: input.currency,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return toTransactionRow(row);
}

export async function update(
  db: Db,
  userId: string,
  id: string,
  input: UpdateTransactionInput,
): Promise<TransactionRow | undefined> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return undefined;
  }
  await assertOwnedReferences(db, userId, { accountId: input.accountId, categoryId: input.categoryId });
  const nextCurrency = input.currency ?? existing.currency;
  const nextAmount = input.amount ?? existing.amount;
  const [row] = await db
    .update(transactions)
    .set({
      accountId: input.accountId ?? existing.accountId,
      categoryId: input.categoryId === undefined ? existing.categoryId : input.categoryId,
      type: input.type ?? existing.type,
      date: input.date ?? existing.date,
      description: input.description === undefined ? existing.description : input.description,
      amountMinor: toMinorUnits(nextAmount, nextCurrency),
      currency: nextCurrency,
      updatedAt: nowIso(),
      version: existing.version + 1,
    })
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .returning();
  return toTransactionRow(row);
}

export async function remove(db: Db, userId: string, id: string): Promise<boolean> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return false;
  }
  await db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  return true;
}

export async function bulkInsert(
  db: Db,
  userId: string,
  inputs: CreateTransactionInput[],
): Promise<TransactionRow[]> {
  if (inputs.length === 0) {
    return [];
  }
  const now = nowIso();
  const rows = await db
    .insert(transactions)
    .values(
      inputs.map((input) => ({
        userId,
        legacyId: input.legacyId ?? null,
        accountId: input.accountId,
        categoryId: input.categoryId ?? null,
        type: input.type,
        date: input.date,
        description: input.description ?? null,
        amountMinor: toMinorUnits(input.amount, input.currency),
        currency: input.currency,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();
  return rows.map(toTransactionRow);
}

// -- investment_trade_details -------------------------------------------------

export interface CreateInvestmentTradeDetailInput {
  transactionId: string;
  instrumentId?: string | null;
  side: string;
  quantity: string;
  price: number;
  fee: number;
  currency: string;
}

function toInvestmentTradeDetailRow(
  row: typeof investmentTradeDetails.$inferSelect,
): InvestmentTradeDetailRow {
  return {
    ...row,
    price: fromMinorUnits(row.priceMinor, row.currency),
    fee: fromMinorUnits(row.feeMinor, row.currency),
  };
}

export async function getTradeDetailByTransaction(
  db: Db,
  userId: string,
  transactionId: string,
): Promise<InvestmentTradeDetailRow | undefined> {
  const [row] = await db
    .select()
    .from(investmentTradeDetails)
    .where(
      and(
        eq(investmentTradeDetails.transactionId, transactionId),
        eq(investmentTradeDetails.userId, userId),
      ),
    );
  return row ? toInvestmentTradeDetailRow(row) : undefined;
}

export async function createTradeDetail(
  db: Db,
  userId: string,
  input: CreateInvestmentTradeDetailInput,
): Promise<InvestmentTradeDetailRow> {
  const now = nowIso();
  const [row] = await db
    .insert(investmentTradeDetails)
    .values({
      userId,
      transactionId: input.transactionId,
      instrumentId: input.instrumentId ?? null,
      side: input.side,
      quantity: input.quantity,
      priceMinor: toMinorUnits(input.price, input.currency),
      feeMinor: toMinorUnits(input.fee, input.currency),
      currency: input.currency,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return toInvestmentTradeDetailRow(row);
}

export async function removeTradeDetail(db: Db, userId: string, id: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(investmentTradeDetails)
    .where(and(eq(investmentTradeDetails.id, id), eq(investmentTradeDetails.userId, userId)));
  if (!row) {
    return false;
  }
  await db
    .delete(investmentTradeDetails)
    .where(and(eq(investmentTradeDetails.id, id), eq(investmentTradeDetails.userId, userId)));
  return true;
}
