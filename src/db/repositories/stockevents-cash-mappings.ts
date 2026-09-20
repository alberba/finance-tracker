/**
 * `stockevents_cash_mappings` + `stockevents_cash_sync_entries` repository.
 *
 * Cash mappings link a (server) account to the Stock Events watchlist where
 * contribution cash must be registered; sync entries record the amount
 * already sent per `(contributionDate, account, watchlist)` so later runs
 * send only the delta instead of duplicating it.
 */

import { and, eq } from "drizzle-orm";
import { stockeventsCashMappings, stockeventsCashSyncEntries } from "../schema";
import { fromMinorUnits, toMinorUnits } from "../../lib/money";
import {
  assertOwnedReferences,
  clientIdentity,
  nowIso,
  versionGuard,
  type Db,
} from "./shared";

export type StockeventsCashMappingRow = typeof stockeventsCashMappings.$inferSelect;
export type StockeventsCashSyncEntryRow = typeof stockeventsCashSyncEntries.$inferSelect;

export interface UpsertStockeventsCashMappingInput {
  id?: string;
  accountId: string | null;
  watchlistId: string;
}

export async function listMappingsByUser(db: Db, userId: string): Promise<StockeventsCashMappingRow[]> {
  return db.select().from(stockeventsCashMappings).where(eq(stockeventsCashMappings.userId, userId));
}

export async function getMapping(
  db: Db,
  userId: string,
  id: string,
): Promise<StockeventsCashMappingRow | undefined> {
  const [row] = await db
    .select()
    .from(stockeventsCashMappings)
    .where(and(eq(stockeventsCashMappings.id, id), eq(stockeventsCashMappings.userId, userId)));
  return row;
}

export async function findMappingByAccount(
  db: Db,
  userId: string,
  accountId: string | null,
): Promise<StockeventsCashMappingRow | undefined> {
  if (accountId === null) {
    const [row] = await db
      .select()
      .from(stockeventsCashMappings)
      .where(
        and(eq(stockeventsCashMappings.userId, userId)),
      );
    return row?.accountId === null ? row : undefined;
  }
  const [row] = await db
    .select()
    .from(stockeventsCashMappings)
    .where(
      and(
        eq(stockeventsCashMappings.userId, userId),
        eq(stockeventsCashMappings.accountId, accountId),
      ),
    );
  return row;
}

export async function upsertMapping(
  db: Db,
  userId: string,
  input: UpsertStockeventsCashMappingInput,
): Promise<StockeventsCashMappingRow> {
  if (input.accountId) {
    await assertOwnedReferences(db, userId, { accountId: input.accountId });
  }
  const existing = await findMappingByAccount(db, userId, input.accountId);
  const now = nowIso();
  if (existing) {
    const [row] = await db
      .update(stockeventsCashMappings)
      .set({ watchlistId: input.watchlistId, updatedAt: now, version: existing.version + 1 })
      .where(and(eq(stockeventsCashMappings.id, existing.id), eq(stockeventsCashMappings.userId, userId)))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(stockeventsCashMappings)
    .values({
      ...clientIdentity(input.id),
      userId,
      accountId: input.accountId,
      watchlistId: input.watchlistId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

export async function removeMapping(db: Db, userId: string, id: string, expectedVersion?: number): Promise<boolean> {
  const deleted = await db
    .delete(stockeventsCashMappings)
    .where(and(
      eq(stockeventsCashMappings.id, id),
      eq(stockeventsCashMappings.userId, userId),
      versionGuard(stockeventsCashMappings.version, expectedVersion),
    ))
    .returning({ id: stockeventsCashMappings.id });
  return deleted.length > 0;
}

export interface UpsertCashSyncEntryInput {
  id?: string;
  contributionDate: string;
  accountId: string | null;
  watchlistId: string;
  syncedAmount: number;
  currency: string;
}

export async function listSyncEntriesByUser(
  db: Db,
  userId: string,
): Promise<Array<StockeventsCashSyncEntryRow & { syncedAmount: number }>> {
  const rows = await db
    .select()
    .from(stockeventsCashSyncEntries)
    .where(eq(stockeventsCashSyncEntries.userId, userId));
  return rows.map((row) => ({ ...row, syncedAmount: fromMinorUnits(row.syncedAmountMinor, row.currency) }));
}

export async function findEntry(
  db: Db,
  userId: string,
  contributionDate: string,
  accountId: string | null,
  watchlistId: string,
): Promise<StockeventsCashSyncEntryRow | undefined> {
  const rows = await db
    .select()
    .from(stockeventsCashSyncEntries)
    .where(
      and(
        eq(stockeventsCashSyncEntries.userId, userId),
        eq(stockeventsCashSyncEntries.contributionDate, contributionDate),
        eq(stockeventsCashSyncEntries.watchlistId, watchlistId),
      ),
    );
  return rows.find((row) => (row.accountId ?? null) === (accountId ?? null));
}

export async function upsertSyncEntry(
  db: Db,
  userId: string,
  input: UpsertCashSyncEntryInput,
): Promise<StockeventsCashSyncEntryRow> {
  if (input.accountId) {
    await assertOwnedReferences(db, userId, { accountId: input.accountId });
  }
  const [existing] = await db
    .select()
    .from(stockeventsCashSyncEntries)
    .where(
      and(
        eq(stockeventsCashSyncEntries.userId, userId),
        eq(stockeventsCashSyncEntries.contributionDate, input.contributionDate),
        eq(stockeventsCashSyncEntries.watchlistId, input.watchlistId),
      ),
    );
  const now = nowIso();
  const match = (existing && (existing.accountId ?? null) === (input.accountId ?? null)) ? existing : undefined;
  if (match) {
    const [row] = await db
      .update(stockeventsCashSyncEntries)
      .set({
        syncedAmountMinor: toMinorUnits(input.syncedAmount, input.currency),
        currency: input.currency,
        updatedAt: now,
        version: match.version + 1,
      })
      .where(and(eq(stockeventsCashSyncEntries.id, match.id), eq(stockeventsCashSyncEntries.userId, userId)))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(stockeventsCashSyncEntries)
    .values({
      ...clientIdentity(input.id),
      userId,
      contributionDate: input.contributionDate,
      accountId: input.accountId,
      watchlistId: input.watchlistId,
      syncedAmountMinor: toMinorUnits(input.syncedAmount, input.currency),
      currency: input.currency,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

export async function removeSyncEntry(
  db: Db,
  userId: string,
  id: string,
  expectedVersion?: number,
): Promise<boolean> {
  const deleted = await db
    .delete(stockeventsCashSyncEntries)
    .where(and(
      eq(stockeventsCashSyncEntries.id, id),
      eq(stockeventsCashSyncEntries.userId, userId),
      versionGuard(stockeventsCashSyncEntries.version, expectedVersion),
    ))
    .returning({ id: stockeventsCashSyncEntries.id });
  return deleted.length > 0;
}

/**
 * Replaces the whole cash-mapping selection (settings-update semantics):
 * entries with a non-empty `watchlistId` are upserted, accounts absent
 * from the list (or with an empty `watchlistId`) lose their mapping.
 */
export async function replaceMappings(
  db: Db,
  userId: string,
  entries: Array<{ accountId: string | null; watchlistId: string }>,
): Promise<StockeventsCashMappingRow[]> {
  const wanted = new Map<string, string>();
  for (const entry of entries) {
    const key = entry.accountId ?? "";
    if (entry.watchlistId) {
      wanted.set(key, entry.watchlistId);
    }
  }
  const current = await listMappingsByUser(db, userId);
  for (const row of current) {
    const key = row.accountId ?? "";
    const watchlistId = wanted.get(key);
    if (watchlistId === undefined) {
      await removeMapping(db, userId, row.id);
    } else if (watchlistId !== row.watchlistId) {
      await upsertMapping(db, userId, { accountId: row.accountId, watchlistId });
    }
  }
  for (const [key, watchlistId] of wanted) {
    if (!current.some((row) => (row.accountId ?? "") === key)) {
      await upsertMapping(db, userId, { accountId: key === "" ? null : key, watchlistId });
    }
  }
  return listMappingsByUser(db, userId);
}
