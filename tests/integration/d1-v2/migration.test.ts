/**
 * WP9 — legacy v1 JSON → v2 migration tool.
 *
 * Exercises `runMigration()` (`scripts/lib/migration-runner.ts`) against a
 * real local-D1-equivalent SQLite database (WP5's `createTestDb()` tier):
 * exactness (parity between v1 and v2 aggregates), repeatability (a second
 * run is a pure no-op), dry-run (rolls back but still reports), and atomic
 * failure (a mid-batch error leaves the database exactly as it was before
 * the run started).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as transactionsRepository from "../../../src/db/repositories/transactions";
import { usersRepository } from "../../../src/db/repositories";
import type { DataEncryptionEnv } from "../../../src/lib/server/crypto/data-encryption";
import { normalizeState } from "../../../src/scripts/state";
import type { State } from "../../../src/scripts/types";
import { computeV1Parity, diffParity } from "../../../scripts/lib/migration-parity";
import { runMigration, type RunMigrationOptions } from "../../../scripts/lib/migration-runner";
import { computeV2Parity } from "../../../scripts/lib/migration-v2-read";
import { createTestDb, type TestDatabase } from "./setup";

const ENCRYPTION_ENV: DataEncryptionEnv = { DATA_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64") };
const LEGACY_OWNER_EMAIL = "legacy-owner@finance-tracker.test";

function baseOptions(overrides: Partial<RunMigrationOptions> = {}): RunMigrationOptions {
  return { legacyOwnerEmail: LEGACY_OWNER_EMAIL, dataEncryptionEnv: ENCRYPTION_ENV, ...overrides };
}

function buildFixtureState(): State {
  return normalizeState({
    year: 2024,
    currency: "eur",
    accounts: [{ id: "acc-cash", name: "Cuenta Corriente", openingBalance: 1000 }],
    investmentAssets: [{ id: "asset-idx", name: "Fondos Indexados", openingBalance: 500 }],
    liabilities: [{ id: "liab-loan", name: "Préstamo", openingBalance: 2000 }],
    twrLiquidityAccountIds: ["acc-cash"],
    incomeCategories: ["Nómina"],
    expenseCategories: ["Vivienda"],
    investmentCategories: ["Fondos Indexados"],
    transactions: [
      { id: "tx-1", date: "2024-01-15", type: "income", accountId: "acc-cash", category: "Nómina", description: "Salario", amount: 2000 },
      { id: "tx-2", date: "2024-01-20", type: "expense", accountId: "acc-cash", category: "Vivienda", description: "Alquiler", amount: 800 },
      {
        id: "tx-3",
        date: "2024-02-05",
        type: "investment",
        accountId: "acc-cash",
        category: "Fondos Indexados",
        description: "Compra fondo",
        amount: -300,
        symbol: "AAPL",
        instrumentId: "instr-aapl",
        side: "buy",
        unitPrice: 150,
        units: 2,
        fee: 1,
        movementCurrency: "EUR",
      },
    ],
    subscriptions: [
      {
        id: "sub-1",
        name: "Netflix",
        amount: 12,
        accountId: "acc-cash",
        category: "Vivienda",
        frequency: "monthly",
        startDate: "2024-01-05",
        nextChargeDate: "2024-02-05",
        active: true,
      },
    ],
    recurringRules: [
      {
        id: "rule-1",
        type: "expense",
        accountId: "acc-cash",
        category: "Vivienda",
        description: "Alquiler mensual",
        amount: 800,
        frequency: "monthly",
        interval: 1,
        startDate: "2024-01-01",
        endDate: null,
        active: true,
        lastExecutionDate: null,
        nextOccurrenceDate: "2024-02-01",
      },
    ],
    pendingMovements: [
      {
        id: "pm-1",
        occurrenceKey: "rule-1:2024-02-01",
        ruleId: "rule-1",
        occurrenceDate: "2024-02-01",
        type: "expense",
        accountId: "acc-cash",
        category: "Vivienda",
        description: "",
        amount: 800,
        status: "pending",
        createdAt: "2024-02-01T00:00:00.000Z",
        updatedAt: "2024-02-01T00:00:00.000Z",
        transactionId: null,
      },
    ],
    budget: {
      income: { Nómina: Array.from({ length: 12 }, () => 2000) },
      expense: { Vivienda: Array.from({ length: 12 }, () => 800) },
      investment: {},
    },
    contributions: [
      {
        id: "contrib-1",
        date: "2024-01-31",
        amount: 300,
        portfolioDate: "2024-01-31",
        portfolioValue: 5000,
        flow: 300,
        flowAllocations: [{ accountId: "acc-cash", amount: 300 }],
      },
    ],
    instruments: [
      {
        id: "instr-aapl",
        investmentAssetId: "asset-idx",
        type: "stock",
        symbol: "aapl",
        market: "NASDAQ",
        currency: "USD",
        provider: "twelve-data",
        active: true,
      },
    ],
    quotes: {
      "instr-aapl": {
        instrumentId: "instr-aapl",
        price: 150,
        currency: "USD",
        timestamp: "2024-02-01T00:00:00.000Z",
        source: "test",
        status: "fresh",
        isStale: false,
        previousClose: null,
        changePercent: null,
      },
    },
    snapshots: {
      "0": { month: 0, accounts: { "acc-cash": 1000 }, investments: { "asset-idx": 500 }, liabilities: { "liab-loan": 2000 } },
    },
    stockEvents: {
      enabled: true,
      apiKey: "secret-api-key-123",
      symbolMappings: [{ symbol: "AAPL", sync: true, watchlistId: "w1", targetSymbol: "AAPL.US", hidden: false }],
    },
  });
}

function tableRowCount(testDb: TestDatabase, table: string): number {
  const row = testDb.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

/**
 * Excludes the always-emitted informational notes (legacyId `"*"`) about
 * fields with no v2 counterpart — those aren't data-quality problems, just
 * a documented "here's what wasn't carried over" summary.
 */
function dataQualityAnomalies(anomalies: { legacyId: string }[]) {
  return anomalies.filter((a) => a.legacyId !== "*");
}

describe("WP9 migration tool", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.close();
  });

  it("migrates a representative v1 state exactly, with zero anomalies and full parity", async () => {
    const state = buildFixtureState();
    const report = await runMigration(testDb.db, state, baseOptions());

    expect(dataQualityAnomalies(report.anomalies)).toEqual([]);
    for (const counts of Object.values(report.counts)) {
      expect(counts.inserted).toBe(counts.source);
      expect(counts.skippedExisting).toBe(0);
      expect(counts.skippedAnomaly).toBe(0);
    }

    const v1Parity = computeV1Parity(state);
    const v2Parity = await computeV2Parity(testDb.db, report.userId, state.year);
    expect(diffParity(v1Parity, v2Parity)).toEqual([]);
  });

  it("is idempotent — a second run inserts nothing new and reproduces the same checksum", async () => {
    const state = buildFixtureState();
    const first = await runMigration(testDb.db, state, baseOptions());
    const second = await runMigration(testDb.db, state, baseOptions());

    expect(second.userId).toBe(first.userId);
    expect(second.checksum).toEqual(first.checksum);
    for (const [collection, counts] of Object.entries(second.counts)) {
      expect(counts.inserted, `${collection} should not insert again on re-run`).toBe(0);
    }
  });

  it("dry-run computes a full report but rolls back every write", async () => {
    const state = buildFixtureState();
    const report = await runMigration(testDb.db, state, baseOptions({ dryRun: true }));

    expect(report.dryRun).toBe(true);
    expect(report.counts.transactions.inserted).toBeGreaterThan(0);
    expect(dataQualityAnomalies(report.anomalies)).toEqual([]);

    expect(tableRowCount(testDb, "users")).toBe(0);
    expect(tableRowCount(testDb, "accounts")).toBe(0);
    expect(tableRowCount(testDb, "transactions")).toBe(0);

    const rerun = await runMigration(testDb.db, state, baseOptions());
    expect(rerun.counts.transactions.inserted).toBe(state.transactions.length);
  });

  it("rolls back the whole batch atomically when one collection fails mid-migration", async () => {
    const state = buildFixtureState();
    const spy = vi.spyOn(transactionsRepository, "bulkInsert").mockRejectedValueOnce(new Error("boom"));

    await expect(runMigration(testDb.db, state, baseOptions())).rejects.toThrow("boom");
    spy.mockRestore();

    // Accounts/categories/instruments were all inserted successfully *before*
    // the forced failure — if the transaction weren't atomic they'd remain.
    expect(tableRowCount(testDb, "users")).toBe(0);
    expect(tableRowCount(testDb, "accounts")).toBe(0);
    expect(tableRowCount(testDb, "categories")).toBe(0);
    expect(tableRowCount(testDb, "market_instruments")).toBe(0);
    expect(tableRowCount(testDb, "transactions")).toBe(0);

    const user = await usersRepository.getByEmail(testDb.db, LEGACY_OWNER_EMAIL);
    expect(user).toBeUndefined();

    // A clean retry afterwards succeeds normally.
    const retry = await runMigration(testDb.db, state, baseOptions());
    expect(dataQualityAnomalies(retry.anomalies)).toEqual([]);
    expect(retry.counts.transactions.inserted).toBe(state.transactions.length);
  });
});
