import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../../../../src/lib/server/auth/principal";
import * as accountsRepository from "../../../../src/db/repositories/accounts";
import * as userSettingsRepository from "../../../../src/db/repositories/user-settings";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "../repositories/fixtures";

let currentDb: TestDatabase["db"];
vi.mock("../../../../src/db/client", () => ({
  getDb: () => currentDb,
}));

function postJson(url: string, body?: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/state/initialize", () => {
  let testDb: TestDatabase;
  let principal: AuthPrincipal;

  beforeEach(async () => {
    testDb = createTestDb();
    currentDb = testDb.db;
    const user = await seedUser(testDb.db, "init-user@example.com");
    principal = {
      userId: user.id,
      email: user.email,
      provider: "better-auth",
      subject: "sub-1",
    };
  });

  afterEach(() => {
    testDb.close();
  });

  it("returns 401 without a principal", async () => {
    const { POST } = await import("../../../../src/pages/api/state/initialize");
    const response = await POST({ request: postJson("https://example.test/api/state/initialize"), locals: {} } as never);
    expect(response.status).toBe(401);
  });

  it("creates default settings + categories exactly once (idempotent replay)", async () => {
    const { POST } = await import("../../../../src/pages/api/state/initialize");

    const first = await POST({
      request: postJson("https://example.test/api/state/initialize"),
      locals: { principal },
    } as never);
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.alreadyInitialized).toBe(false);
    expect(firstBody.settings.currency).toBe("EUR");
    expect(firstBody.categories.length).toBeGreaterThan(0);

    const second = await POST({
      request: postJson("https://example.test/api/state/initialize"),
      locals: { principal },
    } as never);
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.alreadyInitialized).toBe(true);

    const categories = await accountsRepository.listCategoriesByUser(testDb.db, principal.userId);
    expect(categories).toHaveLength(firstBody.categories.length);
  });
});

describe("POST /api/state/reset", () => {
  let testDb: TestDatabase;
  let principal: AuthPrincipal;

  beforeEach(async () => {
    testDb = createTestDb();
    currentDb = testDb.db;
    const user = await seedUser(testDb.db, "reset-user@example.com");
    principal = {
      userId: user.id,
      email: user.email,
      provider: "better-auth",
      subject: "sub-1",
    };
  });

  afterEach(() => {
    testDb.close();
  });

  it("returns 401 without a principal", async () => {
    const { POST } = await import("../../../../src/pages/api/state/reset");
    const response = await POST({ request: postJson("https://example.test/api/state/reset"), locals: {} } as never);
    expect(response.status).toBe(401);
  });

  it("wipes the user's private data and re-seeds defaults", async () => {
    await accountsRepository.create(testDb.db, principal.userId, {
      name: "Cuenta a borrar",
      kind: "cash",
      currency: "EUR",
      openingBalance: 42,
    });
    await userSettingsRepository.create(testDb.db, principal.userId, { currency: "USD" });

    const { POST } = await import("../../../../src/pages/api/state/reset");
    const response = await POST({
      request: postJson("https://example.test/api/state/reset"),
      locals: { principal },
    } as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.settings.currency).toBe("EUR");

    const accounts = await accountsRepository.listByUser(testDb.db, principal.userId);
    expect(accounts).toEqual([]);
  });

  it("wipes owned children too, without leaving orphans or failing mid-way (§2.6)", async () => {
    const transactionsRepository = await import("../../../../src/db/repositories/transactions");
    const recurringRulesRepository = await import("../../../../src/db/repositories/recurring-rules");
    const pendingMovementsRepository = await import("../../../../src/db/repositories/pending-movements");
    const wealthRepository = await import("../../../../src/db/repositories/wealth");
    const contributionsRepository = await import("../../../../src/db/repositories/contributions");

    const account = await accountsRepository.create(testDb.db, principal.userId, {
      name: "Cuenta a borrar",
      kind: "cash",
      currency: "EUR",
      openingBalance: 42,
    });

    // A part of a transaction: its investment operation.
    const investmentTx = await transactionsRepository.create(testDb.db, principal.userId, {
      accountId: account.id,
      type: "investment",
      date: "2026-09-01",
      amount: 100,
      currency: "EUR",
    });
    await transactionsRepository.createTradeDetail(testDb.db, principal.userId, {
      transactionId: investmentTx.id,
      side: "buy",
      quantity: "1",
      price: 100,
      fee: 1,
      currency: "EUR",
    });

    // A part of a recurring rule: its generated (not-yet-confirmed) occurrence.
    const rule = await recurringRulesRepository.create(testDb.db, principal.userId, {
      name: "Aportación",
      type: "investment",
      accountId: account.id,
      amount: 200,
      currency: "EUR",
      frequency: "monthly",
    });
    await pendingMovementsRepository.create(testDb.db, principal.userId, {
      recurringRuleId: rule.id,
      accountId: account.id,
      amount: 200,
      currency: "EUR",
      dueDate: "2026-10-01",
    });

    // A part of a wealth snapshot: its per-account balance.
    const snapshot = await wealthRepository.create(testDb.db, principal.userId, {
      snapshotDate: "2026-09-30",
      year: 2026,
      month: 9,
    });
    await wealthRepository.createBalance(testDb.db, principal.userId, {
      snapshotId: snapshot.id,
      accountId: account.id,
      balance: 42,
      currency: "EUR",
    });

    // A part of a contribution: its per-account allocation.
    const contribution = await contributionsRepository.create(testDb.db, principal.userId, {
      date: "2026-09-01",
      amount: 200,
      currency: "EUR",
    });
    await contributionsRepository.createAllocation(testDb.db, principal.userId, {
      contributionId: contribution.id,
      accountId: account.id,
      amount: 200,
      currency: "EUR",
    });

    const { POST } = await import("../../../../src/pages/api/state/reset");
    const response = await POST({
      request: postJson("https://example.test/api/state/reset"),
      locals: { principal },
    } as never);

    expect(response.status).toBe(200);
    expect(await accountsRepository.listByUser(testDb.db, principal.userId)).toEqual([]);
    expect(await transactionsRepository.listByUser(testDb.db, principal.userId)).toEqual([]);
    expect(await recurringRulesRepository.listByUser(testDb.db, principal.userId)).toEqual([]);
    expect(await pendingMovementsRepository.listByUser(testDb.db, principal.userId)).toEqual([]);
    expect(await wealthRepository.listByUser(testDb.db, principal.userId)).toEqual([]);
    expect(await contributionsRepository.listByUser(testDb.db, principal.userId)).toEqual([]);
    expect(
      await transactionsRepository.getTradeDetailByTransaction(testDb.db, principal.userId, investmentTx.id),
    ).toBeUndefined();
    expect(await wealthRepository.listBalancesBySnapshot(testDb.db, principal.userId, snapshot.id)).toEqual([]);
    expect(
      await contributionsRepository.listAllocationsByContribution(testDb.db, principal.userId, contribution.id),
    ).toEqual([]);
  });
});
