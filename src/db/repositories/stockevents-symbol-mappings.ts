/** `stockevents_symbol_mappings` repository (WP6). */

import { and, eq } from "drizzle-orm";
import { stockeventsSymbolMappings } from "../schema";
import { assertOwnedReferences, nowIso, type Db } from "./shared";

export type StockeventsSymbolMappingRow = typeof stockeventsSymbolMappings.$inferSelect;

export interface CreateStockeventsSymbolMappingInput {
  legacyId?: string | null;
  categoryId?: string | null;
  stockeventsSymbol: string;
}

export interface UpdateStockeventsSymbolMappingInput {
  categoryId?: string | null;
  stockeventsSymbol?: string;
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
      userId,
      legacyId: input.legacyId ?? null,
      categoryId: input.categoryId ?? null,
      stockeventsSymbol: input.stockeventsSymbol,
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
      updatedAt: nowIso(),
    })
    .where(and(eq(stockeventsSymbolMappings.id, id), eq(stockeventsSymbolMappings.userId, userId)))
    .returning();
  return row;
}

export async function remove(db: Db, userId: string, id: string): Promise<boolean> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return false;
  }
  await db
    .delete(stockeventsSymbolMappings)
    .where(and(eq(stockeventsSymbolMappings.id, id), eq(stockeventsSymbolMappings.userId, userId)));
  return true;
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
        userId,
        legacyId: input.legacyId ?? null,
        categoryId: input.categoryId ?? null,
        stockeventsSymbol: input.stockeventsSymbol,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();
}
