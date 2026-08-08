/**
 * Shared types for WP9's legacy JSON → v2 migration tool, rollback exporter,
 * and parity validator (`scripts/migrate-v1-to-v2.ts`,
 * `scripts/export-v2-to-v1-json.ts`, `scripts/validate-migration-parity.ts`).
 */

import type { BudgetType, GoalKey, TransactionType } from "../../src/scripts/types";

/** A structural or data-quality issue found while migrating one collection. */
export interface MigrationAnomaly {
  /** e.g. "transactions", "budgetEntries", "stockEvents". */
  collection: string;
  /** The v1 legacy id (or best-effort identifier) this anomaly is about. */
  legacyId: string;
  /** Human-readable explanation of what was skipped/adjusted and why. */
  message: string;
}

/** Per-collection insert/skip counters for one migration run. */
export interface CollectionCounts {
  /** Rows present in the v1 source for this collection. */
  source: number;
  /** Rows newly inserted into v2 during this run. */
  inserted: number;
  /** Rows already present in v2 (idempotent re-run) — not re-inserted. */
  skippedExisting: number;
  /** Rows dropped because a required reference couldn't be resolved. */
  skippedAnomaly: number;
}

export const MIGRATION_COLLECTIONS = [
  "users",
  "accounts",
  "twrLiquidityAccounts",
  "categories",
  "marketInstruments",
  "marketQuotes",
  "userInstruments",
  "transactions",
  "investmentTradeDetails",
  "subscriptions",
  "recurringRules",
  "pendingMovements",
  "budgetEntries",
  "goals",
  "wealthSnapshots",
  "snapshotBalances",
  "contributions",
  "contributionAllocations",
  "integrationCredentials",
  "stockeventsSymbolMappings",
] as const;

export type MigrationCollection = (typeof MIGRATION_COLLECTIONS)[number];

export type MigrationCountsByCollection = Record<MigrationCollection, CollectionCounts>;

export function emptyCounts(): CollectionCounts {
  return { source: 0, inserted: 0, skippedExisting: 0, skippedAnomaly: 0 };
}

export function emptyCountsByCollection(): MigrationCountsByCollection {
  const out = {} as MigrationCountsByCollection;
  for (const collection of MIGRATION_COLLECTIONS) {
    out[collection] = emptyCounts();
  }
  return out;
}

/** A checksum-friendly, order-independent digest of the migrated dataset. */
export interface MigrationChecksum {
  /** SHA-256 hex digest of the sorted-JSON of every planned legacy id per collection. */
  legacyIdsDigest: string;
  /** SHA-256 hex digest of the parity snapshot (see `migration-parity.ts`). */
  paritySnapshotDigest: string;
}

export interface MigrationReport {
  userId: string;
  legacyOwnerEmail: string;
  dryRun: boolean;
  counts: MigrationCountsByCollection;
  anomalies: MigrationAnomaly[];
  checksum: MigrationChecksum;
}

/** One (year, month 0-11) snapshot's per-kind totals plus net worth. */
export interface WealthSnapshotTotals {
  accounts: number;
  investments: number;
  liabilities: number;
  net: number;
}

/** Aggregates recomputed independently from both v1 and v2 sides for parity checks. */
export interface ParitySnapshot {
  counts: Record<MigrationCollection, number>;
  /** 12-length month-indexed totals per transaction type, for `state.year`. */
  monthlyTotals: Record<TransactionType, number[]>;
  /** Keyed by `"<year>-<month>"` (month 0-11). */
  wealthPerSnapshot: Record<string, WealthSnapshotTotals>;
  /** Yearly sum per (type, category). */
  budgetTotals: Record<BudgetType, Record<string, number>>;
  goalTargets: Record<GoalKey, number>;
}

export interface ParityDiscrepancy {
  path: string;
  v1Value: unknown;
  v2Value: unknown;
}
