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
      provider: "cf-access",
      subject: "sub-1",
      isLegacyOwner: false,
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
      provider: "cf-access",
      subject: "sub-1",
      isLegacyOwner: false,
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
});
