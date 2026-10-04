/**
 * Wealth snapshots + per-account snapshot balances repository (WP6).
 *
 * `snapshotBalances` has no `currency` sibling requirement of its own beyond
 * the column already declared on the table (each balance is money-boundary
 * converted independently, since accounts can carry different currencies).
 */

import { and, eq, inArray } from "drizzle-orm";
import { fromMinorUnits, toMinorUnits } from "../../lib/money";
import { snapshotBalances, wealthSnapshots } from "../schema";
import { type Db, assertOwnedReferences, chunkIds, clientIdentity, nowIso, versionGuard } from "./shared";

export type WealthSnapshotRow = typeof wealthSnapshots.$inferSelect;
export type SnapshotBalanceRow = Omit<typeof snapshotBalances.$inferSelect, "balanceMinor"> & {
  balance: number;
};

export interface CreateWealthSnapshotInput {
  /** Identity minted by the client (ADR 0001); omitted by v1-migrated writes. */
  id?: string;
  legacyId?: string | null;
  snapshotDate: string;
  year: number;
  month: number;
}

export interface CreateSnapshotBalanceInput {
  snapshotId: string;
  accountId?: string | null;
  balance: number;
  currency: string;
}

function toBalanceRow(row: typeof snapshotBalances.$inferSelect): SnapshotBalanceRow {
  return { ...row, balance: fromMinorUnits(row.balanceMinor, row.currency) };
}

// -- wealth_snapshots ----------------------------------------------------------

export async function listByUser(db: Db, userId: string): Promise<WealthSnapshotRow[]> {
  return db.select().from(wealthSnapshots).where(eq(wealthSnapshots.userId, userId));
}

export async function get(db: Db, userId: string, id: string): Promise<WealthSnapshotRow | undefined> {
  const [row] = await db
    .select()
    .from(wealthSnapshots)
    .where(and(eq(wealthSnapshots.id, id), eq(wealthSnapshots.userId, userId)));
  return row;
}

export async function create(
  db: Db,
  userId: string,
  input: CreateWealthSnapshotInput,
): Promise<WealthSnapshotRow> {
  const now = nowIso();
  const [row] = await db
    .insert(wealthSnapshots)
    .values({
      ...clientIdentity(input.id),
      userId,
      legacyId: input.legacyId ?? null,
      snapshotDate: input.snapshotDate,
      year: input.year,
      month: input.month,
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
  input: Partial<CreateWealthSnapshotInput>,
  expectedVersion?: number,
): Promise<WealthSnapshotRow | undefined> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return undefined;
  }
  const [row] = await db
    .update(wealthSnapshots)
    .set({
      snapshotDate: input.snapshotDate ?? existing.snapshotDate,
      year: input.year ?? existing.year,
      month: input.month ?? existing.month,
      updatedAt: nowIso(),
      version: existing.version + 1,
    })
    .where(and(
      eq(wealthSnapshots.id, id),
      eq(wealthSnapshots.userId, userId),
      versionGuard(wealthSnapshots.version, expectedVersion),
    ))
    .returning();
  return row;
}

export async function remove(db: Db, userId: string, id: string, expectedVersion?: number): Promise<boolean> {
  const existing = await get(db, userId, id);
  if (!existing) {
    return false;
  }
  const deleted = await db.delete(wealthSnapshots).where(and(
    eq(wealthSnapshots.id, id),
    eq(wealthSnapshots.userId, userId),
    versionGuard(wealthSnapshots.version, expectedVersion),
  )).returning({ id: wealthSnapshots.id });
  return deleted.length > 0;
}

export async function bulkInsert(
  db: Db,
  userId: string,
  inputs: CreateWealthSnapshotInput[],
): Promise<WealthSnapshotRow[]> {
  if (inputs.length === 0) {
    return [];
  }
  const now = nowIso();
  return db
    .insert(wealthSnapshots)
    .values(
      inputs.map((input) => ({
        ...clientIdentity(input.id),
        userId,
        legacyId: input.legacyId ?? null,
        snapshotDate: input.snapshotDate,
        year: input.year,
        month: input.month,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();
}

// -- snapshot_balances ----------------------------------------------------------

export async function listBalancesBySnapshot(
  db: Db,
  userId: string,
  snapshotId: string,
): Promise<SnapshotBalanceRow[]> {
  const rows = await db
    .select()
    .from(snapshotBalances)
    .where(and(eq(snapshotBalances.userId, userId), eq(snapshotBalances.snapshotId, snapshotId)));
  return rows.map(toBalanceRow);
}

/**
 * Batched form of {@link listBalancesBySnapshot} for bootstrap assembly
 * (audit §5.1): one query for every snapshot's balances instead of one
 * query per snapshot.
 */
export async function listBalancesBySnapshots(
  db: Db,
  userId: string,
  snapshotIds: string[],
): Promise<Map<string, SnapshotBalanceRow[]>> {
  const bySnapshot = new Map<string, SnapshotBalanceRow[]>();
  if (snapshotIds.length === 0) {
    return bySnapshot;
  }
  const rows: (typeof snapshotBalances.$inferSelect)[] = [];
  for (const chunk of chunkIds(snapshotIds)) {
    rows.push(
      ...(await db
        .select()
        .from(snapshotBalances)
        .where(
          and(eq(snapshotBalances.userId, userId), inArray(snapshotBalances.snapshotId, chunk)),
        )),
    );
  }
  for (const row of rows) {
    const balance = toBalanceRow(row);
    const existing = bySnapshot.get(balance.snapshotId);
    if (existing) {
      existing.push(balance);
    } else {
      bySnapshot.set(balance.snapshotId, [balance]);
    }
  }
  return bySnapshot;
}

export async function getBalance(
  db: Db,
  userId: string,
  id: string,
): Promise<SnapshotBalanceRow | undefined> {
  const [row] = await db
    .select()
    .from(snapshotBalances)
    .where(and(eq(snapshotBalances.id, id), eq(snapshotBalances.userId, userId)));
  return row ? toBalanceRow(row) : undefined;
}

export async function createBalance(
  db: Db,
  userId: string,
  input: CreateSnapshotBalanceInput,
): Promise<SnapshotBalanceRow> {
  await assertOwnedReferences(db, userId, {
    snapshotId: input.snapshotId,
    accountId: input.accountId,
  });
  const [row] = await db
    .insert(snapshotBalances)
    .values({
      userId,
      snapshotId: input.snapshotId,
      accountId: input.accountId ?? null,
      balanceMinor: toMinorUnits(input.balance, input.currency),
      currency: input.currency,
      createdAt: nowIso(),
    })
    .returning();
  return toBalanceRow(row);
}

export async function removeBalance(db: Db, userId: string, id: string): Promise<boolean> {
  const existing = await getBalance(db, userId, id);
  if (!existing) {
    return false;
  }
  await db
    .delete(snapshotBalances)
    .where(and(eq(snapshotBalances.id, id), eq(snapshotBalances.userId, userId)));
  return true;
}

/** Replaces every balance of a snapshot with `inputs`, atomically within the caller's transaction. */
export async function replaceBalances(
  db: Db,
  userId: string,
  snapshotId: string,
  inputs: Omit<CreateSnapshotBalanceInput, "snapshotId">[],
): Promise<SnapshotBalanceRow[]> {
  await db
    .delete(snapshotBalances)
    .where(and(eq(snapshotBalances.userId, userId), eq(snapshotBalances.snapshotId, snapshotId)));
  return bulkInsertBalances(db, userId, inputs.map((input) => ({ ...input, snapshotId })));
}

export async function bulkInsertBalances(
  db: Db,
  userId: string,
  inputs: CreateSnapshotBalanceInput[],
): Promise<SnapshotBalanceRow[]> {
  if (inputs.length === 0) {
    return [];
  }
  for (const input of inputs) {
    await assertOwnedReferences(db, userId, {
      snapshotId: input.snapshotId,
      accountId: input.accountId,
    });
  }
  const now = nowIso();
  const rows = await db
    .insert(snapshotBalances)
    .values(
      inputs.map((input) => ({
        userId,
        snapshotId: input.snapshotId,
        accountId: input.accountId ?? null,
        balanceMinor: toMinorUnits(input.balance, input.currency),
        currency: input.currency,
        createdAt: now,
      })),
    )
    .returning();
  return rows.map(toBalanceRow);
}
