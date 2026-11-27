import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../../../../src/lib/server/auth/principal";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "../repositories/fixtures";
import { applySyncBatch } from "../../../../src/lib/server/sync/apply-command";
import * as syncRepository from "../../../../src/db/repositories/sync";
import { runWithDb } from "../../../../src/db/database"

let currentDb: TestDatabase["db"];
vi.mock("../../../../src/db/client", () => ({
  getDb: () => currentDb,
}));

describe("GET /api/changes", () => {
  let testDb: TestDatabase;
  let principal: AuthPrincipal;

  beforeEach(async () => {
    testDb = createTestDb();
    currentDb = testDb.db;
    const user = await seedUser(testDb.db, "changes-user@example.com");
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
    const { GET } = await import("../../../../src/pages/api/changes");
    const response = await GET({
      request: new Request("https://example.test/api/changes?since=0"),
      locals: {},
    } as never);
    expect(response.status).toBe(401);
  });

  it("walks sync_changes with revision > since", async () => {
    await runWithDb(testDb.db, applySyncBatch(principal.userId, [
      {
        commandId: "cmd-1",
        action: "create",
        entityType: "category",
        data: { name: "Ocio", kind: "expense" },
      },
    ]));
    await runWithDb(testDb.db, applySyncBatch(principal.userId, [
      {
        commandId: "cmd-2",
        action: "create",
        entityType: "category",
        data: { name: "Transporte", kind: "expense" },
      },
    ]));

    const { GET } = await import("../../../../src/pages/api/changes");
    const response = await GET({
      request: new Request("https://example.test/api/changes?since=1"),
      locals: { principal },
    } as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.changes).toHaveLength(1);
    expect(body.revision).toBe(2);
  });

  it("orders changes by revision even when they were written out of order", async () => {
    await runWithDb(testDb.db, syncRepository.createChange(principal.userId, {
      revision: 2,
      entityType: "category",
      entityId: "second",
      changeType: "create",
      payload: JSON.stringify({ id: "second" }),
    }));
    await runWithDb(testDb.db, syncRepository.createChange(principal.userId, {
      revision: 1,
      entityType: "category",
      entityId: "first",
      changeType: "create",
      payload: JSON.stringify({ id: "first" }),
    }));

    const { GET } = await import("../../../../src/pages/api/changes");
    const response = await GET({
      request: new Request("https://example.test/api/changes?since=0"),
      locals: { principal },
    } as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.changes.map((change: { revision: number }) => change.revision)).toEqual([1, 2]);
  });

  it("returns 400 for a non-integer since/cursor", async () => {
    const { GET } = await import("../../../../src/pages/api/changes");
    const response = await GET({
      request: new Request("https://example.test/api/changes?since=1.5"),
      locals: { principal },
    } as never);
    expect(response.status).toBe(400);
  });

  it("returns 400 for an invalid since/cursor", async () => {
    const { GET } = await import("../../../../src/pages/api/changes");
    const response = await GET({
      request: new Request("https://example.test/api/changes?since=-1"),
      locals: { principal },
    } as never);
    expect(response.status).toBe(400);
  });
});
