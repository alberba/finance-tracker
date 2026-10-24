/**
 * Transactions + investment-trade-detail extension repository (WP6).
 *
 * `investmentTradeDetails.quantity` is a decimal string, not a minimal-unit
 * money column (see `src/db/schema/transactions.ts`), so it passes through
 * unconverted; `priceMinor`/`feeMinor` go through the money boundary like
 * every other amount column.
 */

import { and, eq, inArray } from 'drizzle-orm'
import { lift } from '../database'
import { fromMinorUnits, toMinorUnits } from '../../lib/money'
import type { RemoteOperation } from '../../lib/bitvavo-types'
import { investmentTradeDetails, transactions } from '../schema'
import {
  type Db,
  RejectedCommandError,
  assertOwnedReferences,
  chunkIds,
  clientIdentity,
  nowIso,
  versionGuard,
} from './shared'

export type TransactionRow = Omit<typeof transactions.$inferSelect, 'amountMinor'> & {
  amount: number
}
export type InvestmentTradeDetailRow = Omit<
  typeof investmentTradeDetails.$inferSelect,
  'priceMinor' | 'feeMinor'
> & {
  price: number
  fee: number
}

/**
 * The operation ("Operación", CONTEXT.md) that gives an investment movement
 * its content. It travels inside the movement's own input, never as a command
 * of its own (ADR 0002), so amount and operation are written together or not
 * at all.
 */
export interface MovementOperationInput {
  symbol?: string | null
  instrumentId?: string | null
  side: string
  units: number
  unitPrice: number
  fee: number
}

export interface CreateTransactionInput {
  /** Identity minted by the client (ADR 0001); omitted by v1-migrated writes. */
  id?: string
  legacyId?: string | null
  accountId: string
  categoryId?: string | null
  type: string
  date: string
  description?: string | null
  amount: number
  currency: string
  time?: string | null
  declared?: boolean
  accountingMonth?: number | null
  operation?: MovementOperationInput | null
  /** Provider identity of an imported movement (Bitvavo); only a backup restore sets it here. */
  externalId?: string | null
  remoteOperation?: RemoteOperation | null
}

export interface UpdateTransactionInput {
  accountId?: string
  categoryId?: string | null
  type?: string
  date?: string
  description?: string | null
  amount?: number
  currency?: string
  time?: string | null
  declared?: boolean
  accountingMonth?: number | null
  operation?: MovementOperationInput | null
}

function toTransactionRow(row: typeof transactions.$inferSelect): TransactionRow {
  return { ...row, amount: fromMinorUnits(row.amountMinor, row.currency) }
}

async function listByUserSql(db: Db, userId: string): Promise<TransactionRow[]> {
  const rows = await db.select().from(transactions).where(eq(transactions.userId, userId))
  return rows.map(toTransactionRow)
}

async function getSql(db: Db, userId: string, id: string): Promise<TransactionRow | undefined> {
  const [row] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
  return row ? toTransactionRow(row) : undefined
}

async function createSql(
  db: Db,
  userId: string,
  input: CreateTransactionInput,
): Promise<TransactionRow> {
  await assertOwnedReferences(db, userId, {
    accountId: input.accountId,
    categoryId: input.categoryId,
  })
  const now = nowIso()
  const [row] = await db
    .insert(transactions)
    .values({
      ...clientIdentity(input.id),
      userId,
      legacyId: input.legacyId ?? null,
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      type: input.type,
      date: input.date,
      description: input.description ?? null,
      amountMinor: toMinorUnits(input.amount, input.currency),
      currency: input.currency,
      time: input.time ?? null,
      declared: input.declared ?? false,
      accountingMonth: input.accountingMonth ?? null,
      externalId: input.externalId ?? null,
      remoteOperation: input.remoteOperation ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  await writeOperation(db, userId, row.id, input.type, input.currency, input.operation)
  return toTransactionRow(row)
}

async function updateSql(
  db: Db,
  userId: string,
  id: string,
  input: UpdateTransactionInput,
  expectedVersion?: number,
): Promise<TransactionRow | undefined> {
  const existing = await getSql(db, userId, id)
  if (!existing) {
    return undefined
  }
  if (existing.remoteOperation) {
    const allowed = new Set(['declared', 'description', 'categoryId'])
    if (Object.keys(input).some((key) => !allowed.has(key))) {
      throw new RejectedCommandError('Bitvavo gobierna los campos financieros de este movimiento.')
    }
  }
  await assertOwnedReferences(db, userId, {
    accountId: input.accountId,
    categoryId: input.categoryId,
  })
  const nextCurrency = input.currency ?? existing.currency
  const nextAmount = input.amount ?? existing.amount
  const nextType = input.type ?? existing.type
  const [row] = await db
    .update(transactions)
    .set({
      accountId: input.accountId ?? existing.accountId,
      categoryId: input.categoryId === undefined ? existing.categoryId : input.categoryId,
      type: nextType,
      date: input.date ?? existing.date,
      description: input.description === undefined ? existing.description : input.description,
      amountMinor: toMinorUnits(nextAmount, nextCurrency),
      currency: nextCurrency,
      time: input.time === undefined ? existing.time : input.time,
      declared: input.declared === undefined ? existing.declared : input.declared,
      accountingMonth:
        input.accountingMonth === undefined ? existing.accountingMonth : input.accountingMonth,
      updatedAt: nowIso(),
      version: existing.version + 1,
    })
    .where(
      and(
        eq(transactions.id, id),
        eq(transactions.userId, userId),
        versionGuard(transactions.version, expectedVersion),
      ),
    )
    .returning()
  if (!row) {
    return undefined
  }
  // Same write as the amount: an edit can never leave the two disagreeing.
  await writeOperation(db, userId, row.id, nextType, nextCurrency, input.operation)
  return toTransactionRow(row)
}

async function removeSql(
  db: Db,
  userId: string,
  id: string,
  expectedVersion?: number,
): Promise<boolean> {
  const existing = await getSql(db, userId, id)
  if (!existing) {
    return false
  }
  if (existing.remoteOperation)
    throw new RejectedCommandError('No se puede borrar un movimiento de Bitvavo.')
  // The FK has no ON DELETE CASCADE and D1 always enforces it.
  await db
    .delete(investmentTradeDetails)
    .where(
      and(eq(investmentTradeDetails.transactionId, id), eq(investmentTradeDetails.userId, userId)),
    )
  const deleted = await db
    .delete(transactions)
    .where(
      and(
        eq(transactions.id, id),
        eq(transactions.userId, userId),
        versionGuard(transactions.version, expectedVersion),
      ),
    )
    .returning({ id: transactions.id })
  return deleted.length > 0
}

async function bulkInsertSql(
  db: Db,
  userId: string,
  inputs: CreateTransactionInput[],
): Promise<TransactionRow[]> {
  if (inputs.length === 0) {
    return []
  }
  const now = nowIso()
  const rows = await db
    .insert(transactions)
    .values(
      inputs.map((input) => ({
        ...clientIdentity(input.id),
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
    .returning()
  return rows.map(toTransactionRow)
}

// -- investment_trade_details -------------------------------------------------

export interface CreateInvestmentTradeDetailInput {
  transactionId: string
  instrumentId?: string | null
  symbol?: string | null
  side: string
  quantity: string
  price: number
  fee: number
  currency: string
}

function toInvestmentTradeDetailRow(
  row: typeof investmentTradeDetails.$inferSelect,
): InvestmentTradeDetailRow {
  return {
    ...row,
    price: fromMinorUnits(row.priceMinor, row.currency),
    fee: fromMinorUnits(row.feeMinor, row.currency),
  }
}

async function getTradeDetailByTransactionSql(
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
    )
  return row ? toInvestmentTradeDetailRow(row) : undefined
}

/**
 * Batched form of {@link getTradeDetailByTransaction} for bootstrap
 * assembly (audit §5.1): one query for every transaction's trade detail
 * instead of one query per transaction. Each transaction has at most one
 * trade detail, so the map is keyed one-to-one.
 */
async function listTradeDetailsByTransactionsSql(
  db: Db,
  userId: string,
  transactionIds: string[],
): Promise<Map<string, InvestmentTradeDetailRow>> {
  const byTransaction = new Map<string, InvestmentTradeDetailRow>()
  if (transactionIds.length === 0) {
    return byTransaction
  }
  const rows: (typeof investmentTradeDetails.$inferSelect)[] = []
  for (const chunk of chunkIds(transactionIds)) {
    rows.push(
      ...(await db
        .select()
        .from(investmentTradeDetails)
        .where(
          and(
            eq(investmentTradeDetails.userId, userId),
            inArray(investmentTradeDetails.transactionId, chunk),
          ),
        )),
    )
  }
  for (const row of rows) {
    const detail = toInvestmentTradeDetailRow(row)
    byTransaction.set(detail.transactionId, detail)
  }
  return byTransaction
}

async function createTradeDetailSql(
  db: Db,
  userId: string,
  input: CreateInvestmentTradeDetailInput,
): Promise<InvestmentTradeDetailRow> {
  const now = nowIso()
  const [row] = await db
    .insert(investmentTradeDetails)
    .values({
      userId,
      transactionId: input.transactionId,
      instrumentId: input.instrumentId ?? null,
      symbol: input.symbol ?? null,
      side: input.side,
      quantity: input.quantity,
      priceMinor: toMinorUnits(input.price, input.currency),
      feeMinor: toMinorUnits(input.fee, input.currency),
      currency: input.currency,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  return toInvestmentTradeDetailRow(row)
}

/**
 * Writes the operation that travels with a movement (ADR 0002): inserts it,
 * updates it in place, or — when the movement stops being an investment —
 * removes it. `undefined` means the caller said nothing about the operation
 * and the stored one is left alone; `null` means there is none.
 */
async function writeOperation(
  db: Db,
  userId: string,
  transactionId: string,
  type: string,
  currency: string,
  operation: MovementOperationInput | null | undefined,
): Promise<void> {
  // Only an investment movement has an operation. Turning one into a gasto
  // drops it, even when the caller said nothing: otherwise the movement would
  // keep títulos and precio it no longer has any meaning for.
  if (type !== 'investment') {
    const stale = await getTradeDetailByTransactionSql(db, userId, transactionId)
    if (stale) {
      await removeTradeDetailSql(db, userId, stale.id)
    }
    return
  }
  if (operation === undefined) {
    return
  }
  const existing = await getTradeDetailByTransactionSql(db, userId, transactionId)
  if (!operation) {
    if (existing) {
      await removeTradeDetailSql(db, userId, existing.id)
    }
    return
  }
  const values = {
    instrumentId: operation.instrumentId ?? null,
    symbol: operation.symbol ?? null,
    side: operation.side,
    quantity: String(operation.units),
    priceMinor: toMinorUnits(operation.unitPrice, currency),
    feeMinor: toMinorUnits(operation.fee, currency),
    currency,
    updatedAt: nowIso(),
  }
  if (existing) {
    await db
      .update(investmentTradeDetails)
      .set(values)
      .where(
        and(eq(investmentTradeDetails.id, existing.id), eq(investmentTradeDetails.userId, userId)),
      )
    return
  }
  await db.insert(investmentTradeDetails).values({
    ...values,
    userId,
    transactionId,
    createdAt: values.updatedAt,
  })
}

async function removeTradeDetailSql(db: Db, userId: string, id: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(investmentTradeDetails)
    .where(and(eq(investmentTradeDetails.id, id), eq(investmentTradeDetails.userId, userId)))
  if (!row) {
    return false
  }
  await db
    .delete(investmentTradeDetails)
    .where(and(eq(investmentTradeDetails.id, id), eq(investmentTradeDetails.userId, userId)))
  return true
}

export const listByUser = lift(listByUserSql)
export const get = lift(getSql)
export const create = lift(createSql)
export const update = lift(updateSql)
export const remove = lift(removeSql)
export const bulkInsert = lift(bulkInsertSql)
export const getTradeDetailByTransaction = lift(getTradeDetailByTransactionSql)
export const listTradeDetailsByTransactions = lift(listTradeDetailsByTransactionsSql)
export const createTradeDetail = lift(createTradeDetailSql)
export const removeTradeDetail = lift(removeTradeDetailSql)
