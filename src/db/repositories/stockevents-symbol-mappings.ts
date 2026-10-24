/** `stockevents_symbol_mappings` repository (WP6, extended: sync flags + optimistic concurrency). */

import { and, eq } from 'drizzle-orm'
import { lift } from '../database'
import { stockeventsSymbolMappings } from '../schema'
import {
  assertOwnedReferences,
  clientIdentity,
  fromFlag,
  nowIso,
  toFlag,
  versionGuard,
  type Db,
} from './shared'

export type StockeventsSymbolMappingRow = typeof stockeventsSymbolMappings.$inferSelect

export interface CreateStockeventsSymbolMappingInput {
  id?: string
  legacyId?: string | null
  categoryId?: string | null
  stockeventsSymbol: string
  sync?: boolean
  watchlistId?: string | null
  hidden?: boolean
}

export interface UpdateStockeventsSymbolMappingInput {
  categoryId?: string | null
  stockeventsSymbol?: string
  sync?: boolean
  watchlistId?: string | null
  hidden?: boolean
}

async function listByUserSql(db: Db, userId: string): Promise<StockeventsSymbolMappingRow[]> {
  return db
    .select()
    .from(stockeventsSymbolMappings)
    .where(eq(stockeventsSymbolMappings.userId, userId))
}

async function getSql(
  db: Db,
  userId: string,
  id: string,
): Promise<StockeventsSymbolMappingRow | undefined> {
  const [row] = await db
    .select()
    .from(stockeventsSymbolMappings)
    .where(and(eq(stockeventsSymbolMappings.id, id), eq(stockeventsSymbolMappings.userId, userId)))
  return row
}

async function findBySymbolSql(
  db: Db,
  userId: string,
  symbol: string,
): Promise<StockeventsSymbolMappingRow | undefined> {
  const [row] = await db
    .select()
    .from(stockeventsSymbolMappings)
    .where(
      and(
        eq(stockeventsSymbolMappings.userId, userId),
        eq(stockeventsSymbolMappings.stockeventsSymbol, symbol),
      ),
    )
  return row
}

export function toDomainShape(row: StockeventsSymbolMappingRow): {
  sync: boolean
  watchlistId: string
  hidden: boolean
} {
  return {
    sync: fromFlag(row.sync),
    watchlistId: row.watchlistId ?? '',
    hidden: fromFlag(row.hidden),
  }
}

async function createSql(
  db: Db,
  userId: string,
  input: CreateStockeventsSymbolMappingInput,
): Promise<StockeventsSymbolMappingRow> {
  await assertOwnedReferences(db, userId, { categoryId: input.categoryId })
  const now = nowIso()
  const [row] = await db
    .insert(stockeventsSymbolMappings)
    .values({
      ...clientIdentity(input.id),
      userId,
      legacyId: input.legacyId ?? null,
      categoryId: input.categoryId ?? null,
      stockeventsSymbol: input.stockeventsSymbol,
      sync: toFlag(input.sync),
      watchlistId: input.watchlistId ?? null,
      hidden: toFlag(input.hidden),
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  return row
}

async function updateSql(
  db: Db,
  userId: string,
  id: string,
  input: UpdateStockeventsSymbolMappingInput,
  expectedVersion?: number,
): Promise<StockeventsSymbolMappingRow | undefined> {
  const existing = await getSql(db, userId, id)
  if (!existing) {
    return undefined
  }
  await assertOwnedReferences(db, userId, { categoryId: input.categoryId })
  const [row] = await db
    .update(stockeventsSymbolMappings)
    .set({
      categoryId: input.categoryId === undefined ? existing.categoryId : input.categoryId,
      stockeventsSymbol: input.stockeventsSymbol ?? existing.stockeventsSymbol,
      sync: input.sync === undefined ? existing.sync : toFlag(input.sync),
      watchlistId: input.watchlistId === undefined ? existing.watchlistId : input.watchlistId,
      hidden: input.hidden === undefined ? existing.hidden : toFlag(input.hidden),
      updatedAt: nowIso(),
      version: existing.version + 1,
    })
    .where(
      and(
        eq(stockeventsSymbolMappings.id, id),
        eq(stockeventsSymbolMappings.userId, userId),
        versionGuard(stockeventsSymbolMappings.version, expectedVersion),
      ),
    )
    .returning()
  return row
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
  const deleted = await db
    .delete(stockeventsSymbolMappings)
    .where(
      and(
        eq(stockeventsSymbolMappings.id, id),
        eq(stockeventsSymbolMappings.userId, userId),
        versionGuard(stockeventsSymbolMappings.version, expectedVersion),
      ),
    )
    .returning({ id: stockeventsSymbolMappings.id })
  return deleted.length > 0
}

async function bulkInsertSql(
  db: Db,
  userId: string,
  inputs: CreateStockeventsSymbolMappingInput[],
): Promise<StockeventsSymbolMappingRow[]> {
  if (inputs.length === 0) {
    return []
  }
  const now = nowIso()
  return db
    .insert(stockeventsSymbolMappings)
    .values(
      inputs.map((input) => ({
        ...clientIdentity(input.id),
        userId,
        legacyId: input.legacyId ?? null,
        categoryId: input.categoryId ?? null,
        stockeventsSymbol: input.stockeventsSymbol,
        sync: toFlag(input.sync),
        watchlistId: input.watchlistId ?? null,
        hidden: toFlag(input.hidden),
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning()
}

export const listByUser = lift(listByUserSql)
export const get = lift(getSql)
export const findBySymbol = lift(findBySymbolSql)
export const create = lift(createSql)
export const update = lift(updateSql)
export const remove = lift(removeSql)
export const bulkInsert = lift(bulkInsertSql)
