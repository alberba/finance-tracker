/** `stockevents_symbol_mappings` repository (WP6, extended: sync flags + optimistic concurrency). */

import { and, eq } from "drizzle-orm";
import { stockeventsSymbolMappings } from "../schema";
import {
  assertOwnedReferences,
  clientIdentity,
  fromFlag,
  nowIso,
  toFlag,
  versionGuard,
  type Db,
} from "./shared";

export type StockeventsSymbolMappingRow = typeof stockeventsSymbolMappings.$inferSelect;

export interface CreateStockeventsSymbolMappingInput {
  id?: string;
  legacyId?: string | null;
  categoryId?: string | null;
  stockeventsSymbol: string;
  sync?: boolean;
  watchlistId?: string | null;
  hidden?: boolean;
}

export interface UpdateStockeventsSymbolMappingInput {
  categoryId?: string | null;
  stockeventsSymbol?: string;
  sync?: boolean;
  watchlistId?: string | null;
  hidden?: boolean;
}

export async function listByUser(db: Db, userId: string): Promise<StockeventsSymbolMappingRow[]> {
  return db.select().from(stockeventsSymbolMappings).where(eq(stockeventsSymbolMappings.userId, userId));
}

export async function get(
  db: Db,
  userId: string,
  id: string,
): Promise<StockeventsSymbolMappingRow | undefined> {
  const [row] = await db
    .select()
    .from(stockeventsSymbolMappings)
    .where(and(eq(stockeventsSymbolMappings.id, id), eq(stockeventsSymbolMappings.userId, userId)));
  return row;
}

export async function findBySymbol(
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
    );
  return row;
}

export function toDomainShape(row: StockeventsSymbolMappingRow): {
  sync: boolean;
  watchlistId: string;
  hidden: boolean;
} {
  return {
    sync: fromFlag(row.sync),
    watchlistId: row.watchlistId ?? "",
    hidden: fromFlag(row.hidden),
  };
}

export async function create(
  db: Db,
  userId: string,
  input: CreateStockeventsSymbolMappingInput,
): Promise<StockeventsSymbolMappingRow> {
  await assertOwnedReferences(db, userId, { categoryId: input.categoryId });
  const now = nowIso();
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
    .returning();
  return row;
}

export async function update(
  db: Db,
  userId: string,
  id: string,
  input: UpdateStockeventsSymbolMappingInput,
  expectedVersion?: number,
): Promise<StockeventsSymbolMappingRow | undefined> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return undefined;
  }
  await assertOwnedReferences(db, userId, { categoryId: input.categoryId });
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
    .where(and(
      eq(stockeventsSymbolMappings.id, id),
      eq(stockeventsSymbolMappings.userId, userId),
      versionGuard(stockeventsSymbolMappings.version, expectedVersion),
    ))
    .returning();
  return row;
}

export async function remove(
  db: Db,
  userId: string,
  id: string,
  expectedVersion?: number,
): Promise<boolean> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return false;
  }
  const deleted = await db
    .delete(stockeventsSymbolMappings)
    .where(and(
      eq(stockeventsSymbolMappings.id, id),
      eq(stockeventsSymbolMappings.userId, userId),
      versionGuard(stockeventsSymbolMappings.version, expectedVersion),
    ))
    .returning({ id: stockeventsSymbolMappings.id });
  return deleted.length > 0;
}

export async function bulkInsert(
  db: Db,
  userId: string,
  inputs: CreateStockeventsSymbolMappingInput[],
): Promise<StockeventsSymbolMappingRow[]> {
  if (inputs.length === 0) {
    return [];
  }
  const now = nowIso();
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
    .returning();
}
