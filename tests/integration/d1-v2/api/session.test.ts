import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../../../../src/lib/server/auth/principal";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "../repositories/fixtures";

let currentDb: TestDatabase["db"];
vi.mock("../../../../src/db/client", () => ({
  getDb: () => currentDb,
}));

describe("GET /api/session", () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = createTestDb();
    currentDb = testDb.db;
  });

  afterEach(() => {
    testDb.close();
  });

  it("returns 401 when Astro.locals.principal is absent, regardless of AUTH_ENFORCED", async () => {
    const { GET } = await import("../../../../src/pages/api/session");
    const response = await GET({ locals: {} } as never);
    expect(response.status).toBe(401);
  });

  it("returns the principal + revision cursor when authenticated", async () => {
    const user = await seedUser(testDb.db, "session-user@example.com");
    const principal: AuthPrincipal = {
      userId: user.id,
      email: user.email,
      provider: "better-auth",
      subject: "sub-1",
    };

    const { GET } = await import("../../../../src/pages/api/session");
    const response = await GET({ locals: { principal } } as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.id).toBe(user.id);
    expect(body.revision).toBe(0);
    expect(body.authentication).toBe("better-auth");
    expect(body.user).not.toHaveProperty("isLegacyOwner");
  });
});
