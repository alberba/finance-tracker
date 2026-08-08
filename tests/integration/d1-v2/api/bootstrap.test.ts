import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../../../../src/lib/server/auth/principal";
import * as accountsRepository from "../../../../src/db/repositories/accounts";
import * as transactionsRepository from "../../../../src/db/repositories/transactions";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "../repositories/fixtures";

let currentDb: TestDatabase["db"];
vi.mock("../../../../src/db/client", () => ({
  getDb: () => currentDb,
}));

describe("GET /api/bootstrap", () => {
  let testDb: TestDatabase;
  let principal: AuthPrincipal;

  beforeEach(async () => {
    testDb = createTestDb();
    currentDb = testDb.db;
    const user = await seedUser(testDb.db, "bootstrap-user@example.com");
    principal = {
      userId: user.id,
      email: user.email,
      provider: "cf-access",
      subject: "sub-1",
      isLegacyOwner: false,
    };
  });

  afterEach(() => {
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
    expect(await accountsRepository.listByUser(testDb.db, principal.userId)).toEqual([]);
  });

  it("filters transactions/budgetEntries/wealthSnapshots by ?year", async () => {
    const account = await accountsRepository.create(testDb.db, principal.userId, {
      name: "Cuenta",
      kind: "cash",
      currency: "EUR",
      openingBalance: 0,
    });
    await transactionsRepository.create(testDb.db, principal.userId, {
      accountId: account.id,
      type: "expense",
      date: "2024-05-01",
      amount: -10,
      currency: "EUR",
    });
    await transactionsRepository.create(testDb.db, principal.userId, {
      accountId: account.id,
      type: "expense",
      date: "2025-05-01",
      amount: -20,
      currency: "EUR",
    });

    const { GET } = await import("../../../../src/pages/api/bootstrap");
    const response = await GET({
      request: new Request("https://example.test/api/bootstrap?year=2024"),
      locals: { principal },
    } as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0].date).toBe("2024-05-01");
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
