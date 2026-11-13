import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../../../../src/lib/server/auth/principal";
import * as accountsRepository from "../../../../src/db/repositories/accounts";
import * as budgetEntriesRepository from "../../../../src/db/repositories/budget-entries";
import * as contributionsRepository from "../../../../src/db/repositories/contributions";
import * as integrationCredentialsRepository from "../../../../src/db/repositories/integration-credentials";
import * as marketRepository from "../../../../src/db/repositories/market";
import * as transactionsRepository from "../../../../src/db/repositories/transactions";
import * as wealthRepository from "../../../../src/db/repositories/wealth";
import { createStatementRecorder, createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "../repositories/fixtures";
import { runWithDb } from '../../../../src/db/database'

let currentDb: TestDatabase["db"];
vi.mock("../../../../src/db/client", () => ({
  getDb: () => currentDb,
}));

/**
 * One row in each year-scoped collection and its relation, for two different
 * years, plus a contribution and its allocation per year (contributions are
 * deliberately never filtered by year). The amounts match the shape the
 * bootstrap serves: numeric prices/amounts and the raw decimal-string
 * `quantity` from the trade-detail row.
 */
async function seedNestedRelations(db: TestDatabase["db"], userId: string, symbol = "VWCE") {
  const account = await runWithDb(db, accountsRepository.create(userId, {
    name: "Broker",
    kind: "investment",
    currency: "EUR",
    openingBalance: 0,
  }))
  const category = await runWithDb(db, accountsRepository.createCategory(userId, {
    name: "Ocio",
    kind: "expense",
  }))
  const instrument = await runWithDb(db, marketRepository.createInstrument({
    symbol,
    normalizedSymbol: symbol,
    provider: "test",
    currency: "EUR",
  }))

  const transaction2026 = await runWithDb(db, transactionsRepository.create(userId, {
    accountId: account.id,
    categoryId: category.id,
    type: "investment",
    date: "2026-05-02",
    amount: -250.5,
    currency: "EUR",
    operation: {
      instrumentId: instrument.id,
      symbol,
      side: "buy",
      units: 2.5,
      unitPrice: 100,
      fee: 0.5,
    },
  }))
  const transaction2025 = await runWithDb(db, transactionsRepository.create(userId, {
    accountId: account.id,
    categoryId: category.id,
    type: "investment",
    date: "2025-12-31",
    amount: -100,
    currency: "EUR",
    operation: { instrumentId: instrument.id, symbol, side: "buy", units: 1, unitPrice: 100, fee: 0 },
  }))

  const snapshot2026 = await runWithDb(db, wealthRepository.create(userId, {
    snapshotDate: "2026-05-31",
    year: 2026,
    month: 5,
  }))
  await runWithDb(db, wealthRepository.createBalance(userId, {
    snapshotId: snapshot2026.id,
    accountId: account.id,
    balance: 1000,
    currency: "EUR",
  }))
  const snapshot2025 = await runWithDb(db, wealthRepository.create(userId, {
    snapshotDate: "2025-12-31",
    year: 2025,
    month: 12,
  }))
  await runWithDb(db, wealthRepository.createBalance(userId, {
    snapshotId: snapshot2025.id,
    accountId: account.id,
    balance: 999,
    currency: "EUR",
  }))

  const contribution2026 = await runWithDb(db, contributionsRepository.create(userId, {
    date: "2026-05-10",
    amount: 300,
    currency: "EUR",
  }))
  await runWithDb(db, contributionsRepository.createAllocation(userId, {
    contributionId: contribution2026.id,
    accountId: account.id,
    amount: 300,
    currency: "EUR",
  }))
  const contribution2025 = await runWithDb(db, contributionsRepository.create(userId, {
    date: "2025-12-10",
    amount: 200,
    currency: "EUR",
  }))
  await runWithDb(db, contributionsRepository.createAllocation(userId, {
    contributionId: contribution2025.id,
    accountId: account.id,
    amount: 200,
    currency: "EUR",
  }))

  const budgetEntry2026 = await runWithDb(db, budgetEntriesRepository.create(userId, {
    categoryId: category.id,
    year: 2026,
    month: 5,
    amount: 50,
    currency: "EUR",
  }))
  const budgetEntry2025 = await runWithDb(db, budgetEntriesRepository.create(userId, {
    categoryId: category.id,
    year: 2025,
    month: 12,
    amount: 40,
    currency: "EUR",
  }))

  return {
    account,
    instrument,
    transaction2026,
    transaction2025,
    snapshot2026,
    snapshot2025,
    contribution2026,
    contribution2025,
    budgetEntry2026,
    budgetEntry2025,
  };
}

describe("GET /api/bootstrap", () => {
  let testDb: TestDatabase;
  let principal: AuthPrincipal;
  const recorder = createStatementRecorder();

  beforeEach(async () => {
    testDb = createTestDb({ onStatement: recorder.onStatement });
    currentDb = testDb.db;
    const user = await seedUser(testDb.db, "bootstrap-user@example.com");
    principal = {
      userId: user.id,
      email: user.email,
      provider: "better-auth",
      subject: "sub-1",
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    testDb.close();
  });

  it("returns 401 without a principal", async () => {
    const { GET } = await import("../../../../src/pages/api/bootstrap");
    const response = await GET({
      request: new Request("https://example.test/api/bootstrap"),
      locals: {},
    } as never);
    expect(response.status).toBe(401);
  });

  it("never writes as a side effect (no rows created on a bare GET)", async () => {
    const { GET } = await import("../../../../src/pages/api/bootstrap");
    const response = await GET({
      request: new Request("https://example.test/api/bootstrap"),
      locals: { principal },
    } as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.accounts).toEqual([]);
    expect(body.settings).toBeNull();
    // Confirm nothing was seeded server-side (fixes Contradiction #8).
    expect(await runWithDb(testDb.db, accountsRepository.listByUser(principal.userId))).toEqual([]);
  });

  it("returns the complete nested relations of the selected year, only the authenticated user's", async () => {
    const seeded = await seedNestedRelations(testDb.db, principal.userId);
    // Another user with their own rows in the same year: any leak adds ids
    // to the exact lists asserted below.
    const other = await seedUser(testDb.db, "bootstrap-other@example.com");
    await seedNestedRelations(testDb.db, other.id, "VWCE-OTHER");

    const { GET } = await import("../../../../src/pages/api/bootstrap");
    const response = await GET({
      request: new Request("https://example.test/api/bootstrap?year=2026"),
      locals: { principal },
    } as never);
    expect(response.status).toBe(200);
    const body = await response.json();

    // The bootstrap payload keeps its field names.
    expect(Object.keys(body).sort()).toEqual([
      "accounts",
      "budgetEntries",
      "categories",
      "contributions",
      "goals",
      "instruments",
      "pendingMovements",
      "recurringRules",
      "revision",
      "settings",
      "stockeventsCashMappings",
      "stockeventsCashSyncEntries",
      "stockeventsSymbolMappings",
      "subscriptions",
      "transactions",
      "twrLiquidityAccounts",
      "userInstruments",
      "wealthSnapshots",
      "year",
    ]);

    expect(body.transactions.map((transaction: { id: string }) => transaction.id)).toEqual([
      seeded.transaction2026.id,
    ]);
    // The bootstrap serialization keeps the raw trade-detail row: quantity is
    // the decimal string and price/fee are already converted numbers.
    expect(body.transactions[0].tradeDetail).toMatchObject({
      transactionId: seeded.transaction2026.id,
      instrumentId: seeded.instrument.id,
      symbol: "VWCE",
      side: "buy",
      quantity: "2.5",
      price: 100,
      fee: 0.5,
      currency: "EUR",
    });

    expect(body.wealthSnapshots.map((snapshot: { id: string }) => snapshot.id)).toEqual([
      seeded.snapshot2026.id,
    ]);
    expect(body.wealthSnapshots[0].balances).toHaveLength(1);
    expect(body.wealthSnapshots[0].balances[0]).toMatchObject({
      accountId: seeded.account.id,
      balance: 1000,
      currency: "EUR",
    });

    // Contributions are never filtered by year, so both keep their allocation.
    expect(body.contributions.map((contribution: { id: string }) => contribution.id).sort()).toEqual(
      [seeded.contribution2025.id, seeded.contribution2026.id].sort(),
    );
    expect(
      body.contributions.find(
        (contribution: { id: string }) => contribution.id === seeded.contribution2026.id,
      ).allocations,
    ).toEqual([
      expect.objectContaining({ accountId: seeded.account.id, amount: 300, currency: "EUR" }),
    ]);

    expect(body.budgetEntries.map((entry: { id: string }) => entry.id)).toEqual([
      seeded.budgetEntry2026.id,
    ]);
  });

  it("loads each relation in one query, scoped to the selected year in the bootstrap and unscoped in the export", async () => {
    const seeded = await seedNestedRelations(testDb.db, principal.userId);
    // A second row of the selected year in each parent collection, so that a
    // query per parent row is told apart from one batched query.
    const secondSnapshot = await runWithDb(testDb.db, wealthRepository.create(principal.userId, {
      snapshotDate: "2026-06-30",
      year: 2026,
      month: 6,
    }));
    await runWithDb(testDb.db, wealthRepository.createBalance(principal.userId, {
      snapshotId: secondSnapshot.id,
      accountId: seeded.account.id,
      balance: 1100,
      currency: "EUR",
    }));
    const secondTransaction = await runWithDb(testDb.db, transactionsRepository.create(principal.userId, {
      accountId: seeded.account.id,
      type: "investment",
      date: "2026-06-02",
      amount: -100,
      currency: "EUR",
      operation: {
        instrumentId: seeded.instrument.id,
        symbol: "VWCE",
        side: "buy",
        units: 1,
        unitPrice: 100,
        fee: 0,
      },
    }));
    recorder.clear();

    const { GET } = await import("../../../../src/pages/api/bootstrap");
    const response = await GET({
      request: new Request("https://example.test/api/bootstrap?year=2026"),
      locals: { principal },
    } as never);
    expect(response.status).toBe(200);

    // One batched query per relation, observed at the persistence boundary.
    const balances = recorder.selectsFrom("snapshot_balances");
    expect(balances).toHaveLength(1);
    expect(balances[0].params).toContain(seeded.snapshot2026.id);
    expect(balances[0].params).toContain(secondSnapshot.id);
    expect(balances[0].params).not.toContain(seeded.snapshot2025.id);

    const tradeDetails = recorder.selectsFrom("investment_trade_details");
    expect(tradeDetails).toHaveLength(1);
    expect(tradeDetails[0].params).toContain(seeded.transaction2026.id);
    expect(tradeDetails[0].params).toContain(secondTransaction.id);
    expect(tradeDetails[0].params).not.toContain(seeded.transaction2025.id);

    // Contributions are outside the year filter: every contribution's
    // allocations are loaded, not only the selected year's.
    const allocations = recorder.selectsFrom("contribution_allocations");
    expect(allocations).toHaveLength(1);
    expect(allocations[0].params).toContain(seeded.contribution2025.id);
    expect(allocations[0].params).toContain(seeded.contribution2026.id);

    // The backup export reads the same relations with no year scope: still one
    // query per relation, now carrying the 2025 rows too.
    recorder.clear();
    const { GET: exportGET } = await import("../../../../src/pages/api/data/export");
    const exportResponse = await exportGET({ locals: { principal } } as never);
    expect(exportResponse.status).toBe(200);

    const exportBalances = recorder.selectsFrom("snapshot_balances");
    expect(exportBalances).toHaveLength(1);
    expect(exportBalances[0].params).toEqual(
      expect.arrayContaining([seeded.snapshot2025.id, seeded.snapshot2026.id, secondSnapshot.id]),
    );
    const exportTradeDetails = recorder.selectsFrom("investment_trade_details");
    expect(exportTradeDetails).toHaveLength(1);
    expect(exportTradeDetails[0].params).toEqual(
      expect.arrayContaining([
        seeded.transaction2025.id,
        seeded.transaction2026.id,
        secondTransaction.id,
      ]),
    );
    const exportAllocations = recorder.selectsFrom("contribution_allocations");
    expect(exportAllocations).toHaveLength(1);
    expect(exportAllocations[0].params).toEqual(
      expect.arrayContaining([seeded.contribution2025.id, seeded.contribution2026.id]),
    );
  });

  it("never includes integration_credentials", async () => {
    const testEnv = { DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
    await runWithDb(testDb.db, integrationCredentialsRepository.create(principal.userId,
      { provider: "stockevents", secret: "super-secret-plaintext-key" },
      testEnv,));

    const { GET } = await import("../../../../src/pages/api/bootstrap");
    const response = await GET({
      request: new Request("https://example.test/api/bootstrap"),
      locals: { principal },
    } as never);
    const bodyText = await response.text();
    expect(bodyText).not.toContain("super-secret-plaintext-key");
    expect(bodyText).not.toContain("integrationCredentials");
    expect(bodyText).not.toContain("integration_credentials");
  });

  it("returns 400 for an invalid year", async () => {
    const { GET } = await import("../../../../src/pages/api/bootstrap");
    const response = await GET({
      request: new Request("https://example.test/api/bootstrap?year=not-a-year"),
      locals: { principal },
    } as never);
    expect(response.status).toBe(400);
  });
});
