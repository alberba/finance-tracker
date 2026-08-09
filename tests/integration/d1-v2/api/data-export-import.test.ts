import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../../../../src/lib/server/auth/principal";
import * as accountsRepository from "../../../../src/db/repositories/accounts";
import * as transactionsRepository from "../../../../src/db/repositories/transactions";
import * as integrationCredentialsRepository from "../../../../src/db/repositories/integration-credentials";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "../repositories/fixtures";

let currentDb: TestDatabase["db"];
vi.mock("../../../../src/db/client", () => ({
  getDb: () => currentDb,
}));

function postJson(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/data/export + POST /api/data/import", () => {
  let testDb: TestDatabase;
  let principal: AuthPrincipal;

  beforeEach(async () => {
    testDb = createTestDb();
    currentDb = testDb.db;
    const user = await seedUser(testDb.db, "export-user@example.com");
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
    const { GET } = await import("../../../../src/pages/api/data/export");
    const response = await GET({ locals: {} } as never);
    expect(response.status).toBe(401);
  });

  it("never includes integration_credentials, even when the user has one configured", async () => {
    const testEnv = { DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
    await integrationCredentialsRepository.create(
      testDb.db,
      principal.userId,
      { provider: "stockevents", secret: "super-secret-plaintext-key" },
      testEnv,
    );

    const { GET } = await import("../../../../src/pages/api/data/export");
    const response = await GET({ locals: { principal } } as never);
    const bodyText = await response.text();
    expect(bodyText).not.toContain("super-secret-plaintext-key");
    expect(bodyText).not.toContain("integrationCredentials");
    expect(bodyText).not.toContain("integration_credentials");
  });

  it("round-trips accounts/transactions through export → import with FK ids remapped", async () => {
    const account = await accountsRepository.create(testDb.db, principal.userId, {
      name: "Cuenta origen",
      kind: "cash",
      currency: "EUR",
      openingBalance: 10,
    });
    await transactionsRepository.create(testDb.db, principal.userId, {
      accountId: account.id,
      type: "expense",
      date: "2024-01-01",
      amount: -5,
      currency: "EUR",
    });

    const { GET: exportGET } = await import("../../../../src/pages/api/data/export");
    const exportResponse = await exportGET({ locals: { principal } } as never);
    const exported = await exportResponse.json();
    expect(exported.accounts).toHaveLength(1);
    expect(exported.transactions).toHaveLength(1);

    // Import into a brand-new (empty) user — the account/transaction ids in
    // the export payload must not be reused verbatim; the importer remaps
    // old->new ids as it recreates the dependency chain.
    const otherUser = await seedUser(testDb.db, "import-target@example.com");
    const otherPrincipal: AuthPrincipal = {
      userId: otherUser.id,
      email: otherUser.email,
      provider: "cf-access",
      subject: "sub-2",
      isLegacyOwner: false,
    };

    const { POST: importPOST } = await import("../../../../src/pages/api/data/import");
    const importResponse = await importPOST({
      request: postJson("https://example.test/api/data/import", exported),
      locals: { principal: otherPrincipal },
    } as never);
    expect(importResponse.status).toBe(200);
    const importBody = await importResponse.json();
    expect(importBody.imported.accounts).toBe(1);
    expect(importBody.imported.transactions).toBe(1);
    expect(importBody.skipped.transactions ?? 0).toBe(0);

    const importedAccounts = await accountsRepository.listByUser(testDb.db, otherUser.id);
    expect(importedAccounts).toHaveLength(1);
    expect(importedAccounts[0].id).not.toBe(account.id);

    const importedTransactions = await transactionsRepository.listByUser(testDb.db, otherUser.id);
    expect(importedTransactions).toHaveLength(1);
    expect(importedTransactions[0].accountId).toBe(importedAccounts[0].id);
    expect(importedTransactions[0].amount).toBe(-5);
  });
});
