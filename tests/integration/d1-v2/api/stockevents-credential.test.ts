import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthPrincipal } from "../../../../src/lib/server/auth/principal";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "../repositories/fixtures";

const ENCRYPTION_KEY = "jczGrUcJ9753I5noa+t5lM2U28P2WYQsgwABKiOwguQ=";
let currentDb: TestDatabase["db"];

vi.mock("../../../../src/db/client", () => ({ getDb: () => currentDb }));

function request(method: "PUT" | "DELETE", apiKey?: string): Request {
  return new Request("https://app.example/api/integrations/stockevents", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(apiKey === undefined ? {} : { body: JSON.stringify({ apiKey }) }),
  });
}

function locals(principal?: AuthPrincipal) {
  return {
    principal,
    runtimeEnv: { DATA_ENCRYPTION_KEY: ENCRYPTION_KEY },
  };
}

describe("/api/integrations/stockevents", () => {
  let testDb: TestDatabase;
  let owner: AuthPrincipal;
  let otherUser: AuthPrincipal;

  beforeEach(async () => {
    testDb = createTestDb();
    currentDb = testDb.db;
    const ownerRow = await seedUser(testDb.db, "credential-owner@example.com");
    const otherRow = await seedUser(testDb.db, "credential-other@example.com");
    owner = {
      userId: ownerRow.id,
      email: ownerRow.email,
      provider: "test",
      subject: "owner",
      isLegacyOwner: false,
    };
    otherUser = {
      userId: otherRow.id,
      email: otherRow.email,
      provider: "test",
      subject: "other",
      isLegacyOwner: false,
    };
  });

  afterEach(() => testDb.close());

  it("requires an authenticated principal", async () => {
    const { GET } = await import("../../../../src/pages/api/integrations/stockevents");
    const response = await GET({ locals: locals() } as never);
    expect(response.status).toBe(401);
  });

  it("stores the key encrypted, never returns it, and isolates status by user", async () => {
    const { GET, PUT } = await import("../../../../src/pages/api/integrations/stockevents");
    const saved = await PUT({
      request: request("PUT", "se_live_private_value"),
      locals: locals(owner),
    } as never);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ configured: true });

    const raw = testDb.sqlite
      .prepare("SELECT ciphertext FROM integration_credentials WHERE user_id = ?")
      .get(owner.userId) as { ciphertext: string };
    expect(raw.ciphertext).not.toContain("se_live_private_value");

    const ownerStatus = await GET({ locals: locals(owner) } as never);
    expect(await ownerStatus.json()).toEqual({ configured: true });
    const otherStatus = await GET({ locals: locals(otherUser) } as never);
    expect(await otherStatus.json()).toEqual({ configured: false });
  });

  it("deletes only the authenticated user's credential", async () => {
    const { DELETE, GET, PUT } = await import("../../../../src/pages/api/integrations/stockevents");
    await PUT({ request: request("PUT", "se_live_private_value"), locals: locals(owner) } as never);

    const removed = await DELETE({ request: request("DELETE"), locals: locals(owner) } as never);
    expect(await removed.json()).toEqual({ configured: false });
    const status = await GET({ locals: locals(owner) } as never);
    expect(await status.json()).toEqual({ configured: false });
  });
});
