import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../../../../src/lib/server/auth/principal";
import * as accountsRepository from "../../../../src/db/repositories/accounts";
import * as syncRepository from "../../../../src/db/repositories/sync";
import { syncCommands } from "../../../../src/db/schema";
import { eq } from "drizzle-orm";
import { applyOneCommand } from "../../../../src/lib/server/sync/apply-command";
import { createTestDb, type TestDatabase } from "../setup";
import { seedUser } from "../repositories/fixtures";
import { runWithDb } from '../../../../src/db/database'
import { Effect } from "effect";

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

describe("POST /api/sync", () => {
  let testDb: TestDatabase;
  let principal: AuthPrincipal;

  beforeEach(async () => {
    testDb = createTestDb();
    currentDb = testDb.db;
    const user = await seedUser(testDb.db, "sync-user@example.com");
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
    const { POST } = await import("../../../../src/pages/api/sync");
    const response = await POST({
      request: postJson("https://example.test/api/sync", { commands: [] }),
      locals: {},
    } as never);
    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid payload (Zod validation)", async () => {
    const { POST } = await import("../../../../src/pages/api/sync");
    const response = await POST({
      request: postJson("https://example.test/api/sync", {
        commands: [{ commandId: "x", action: "create" /* missing entityType/data */ }],
      }),
      locals: { principal },
    } as never);
    expect(response.status).toBe(400);
  });

  it("returns 400 when the batch exceeds 5 commands", async () => {
    const { POST } = await import("../../../../src/pages/api/sync");
    const commands = Array.from({ length: 6 }, (_, i) => ({
      commandId: `cmd-${i}`,
      action: "noop" as const,
    }));
    const response = await POST({
      request: postJson("https://example.test/api/sync", { commands }),
      locals: { principal },
    } as never);
    expect(response.status).toBe(400);
  });

  it("applies a create command and bumps the revision", async () => {
    const { POST } = await import("../../../../src/pages/api/sync");
    const response = await POST({
      request: postJson("https://example.test/api/sync", {
        commands: [
          {
            commandId: "create-account-1",
            action: "create",
            entityType: "account",
            data: { name: "Cuenta", kind: "cash", currency: "EUR", openingBalance: 100 },
          },
        ],
      }),
      locals: { principal },
    } as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results[0].status).toBe("applied");
    expect(body.revision).toBe(1);

    const accounts = await runWithDb(testDb.db, accountsRepository.listByUser(principal.userId));
    expect(accounts).toHaveLength(1);
  });

  it("idempotent replay: the same commandId returns the stored result without re-applying the mutation", async () => {
    const { POST } = await import("../../../../src/pages/api/sync");
    const command = {
      commandId: "create-account-replay",
      action: "create" as const,
      entityType: "account" as const,
      data: { name: "Cuenta", kind: "cash", currency: "EUR", openingBalance: 50 },
    };

    const first = await POST({
      request: postJson("https://example.test/api/sync", { commands: [command] }),
      locals: { principal },
    } as never);
    expect(first.status).toBe(200);

    const second = await POST({
      request: postJson("https://example.test/api/sync", { commands: [command] }),
      locals: { principal },
    } as never);
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.results[0].replayed).toBe(true);

    // Only one account was ever created — the replay did not duplicate the mutation.
    const accounts = await runWithDb(testDb.db, accountsRepository.listByUser(principal.userId));
    expect(accounts).toHaveLength(1);
  });

  it("recovers a stale processing create without duplicating a partially applied entity", async () => {
    const commandId = "recover-partial-create";
    const legacyId = "local-account-recovery";
    await runWithDb(testDb.db, accountsRepository.create(principal.userId, {
      legacyId, name: "Ya aplicada", kind: "cash", currency: "EUR", openingBalance: 25,
    }));
    await runWithDb(testDb.db, syncRepository.createCommand(principal.userId, {
      id: commandId, commandType: "create", status: "processing", result: null,
      payload: JSON.stringify({ commandId }),
    }));
    await testDb.db.update(syncCommands)
      .set({ createdAt: "2000-01-01T00:00:00.000Z" })
      .where(eq(syncCommands.id, commandId));

    const outcome = await runWithDb(testDb.db, applyOneCommand(principal.userId, {
      commandId, action: "create", entityType: "account",
      data: { legacyId, name: "Ya aplicada", kind: "cash", currency: "EUR", openingBalance: 25 },
    }));

    expect(outcome.status).toBe("noop");
    expect(await runWithDb(testDb.db, accountsRepository.listByUser(principal.userId))).toHaveLength(1);
    expect((await runWithDb(testDb.db, syncRepository.getCommand(principal.userId, commandId)))?.result).not.toBeNull();
  });

  it("answers a command still inside its processing lease with in_progress and halts the batch, not a 500 (issue #202)", async () => {
    const { POST } = await import("../../../../src/pages/api/sync");
    const commandId = "still-processing";
    await runWithDb(testDb.db, syncRepository.createCommand(principal.userId, {
      id: commandId, commandType: "create", status: "processing", result: null,
      payload: JSON.stringify({ commandId }),
    }));

    const response = await POST({
      request: postJson("https://example.test/api/sync", {
        commands: [
          { commandId, action: "create", entityType: "account", data: { name: "Cuenta", kind: "cash", currency: "EUR", openingBalance: 0 } },
          { commandId: "after-in-progress", action: "noop" },
        ],
      }),
      locals: { principal },
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.halted).toBe(true);
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({ commandId, status: "in_progress" });
    expect(await runWithDb(testDb.db, accountsRepository.listByUser(principal.userId))).toHaveLength(0);
    expect((await runWithDb(testDb.db, syncRepository.getCommand(principal.userId, commandId)))?.result).toBeNull();
  });

  it("answers in_progress when a racing request reserves the command first (unique-violation branch, issue #202)", async () => {
    const commandId = "raced-reservation";
    await runWithDb(testDb.db, syncRepository.createCommand(principal.userId, {
      id: commandId, commandType: "noop", status: "processing", result: null,
      payload: JSON.stringify({ commandId }),
    }));
    // The first lookup misses, as if the other request inserted the row
    // right after it: the insert then hits the unique constraint.
    const spy = vi.spyOn(syncRepository, "getCommand").mockReturnValueOnce(Effect.succeed(undefined));

    try {
      const outcome = await runWithDb(testDb.db, applyOneCommand(principal.userId, { commandId, action: "noop" }));
      expect(outcome).toMatchObject({ commandId, status: "in_progress", replayed: false });
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  it("applies a concurrently repeated commandId at most once", async () => {
    const command = {
      commandId: "create-account-concurrent",
      action: "create" as const,
      entityType: "account" as const,
      data: { name: "Única", kind: "cash", currency: "EUR", openingBalance: 50 },
    };

    const outcomes = await Promise.allSettled([
      runWithDb(testDb.db, applyOneCommand(principal.userId, command)),
      runWithDb(testDb.db, applyOneCommand(principal.userId, command)),
    ]);

    expect(outcomes.some((outcome) => outcome.status === "fulfilled")).toBe(true);
    expect(await runWithDb(testDb.db, accountsRepository.listByUser(principal.userId))).toHaveLength(1);
  });

  it("allows only one of two concurrent updates with the same baseVersion", async () => {
    const account = await runWithDb(testDb.db, accountsRepository.create(principal.userId, {
      name: "Original",
      kind: "cash",
      currency: "EUR",
      openingBalance: 0,
    }));

    const outcomes = await Promise.all([
      runWithDb(testDb.db, applyOneCommand(principal.userId, {
        commandId: "concurrent-update-a",
        action: "update",
        entityType: "account",
        entityId: account.id,
        baseVersion: account.version,
        patch: { name: "Cambio A" },
      })),
      runWithDb(testDb.db, applyOneCommand(principal.userId, {
        commandId: "concurrent-update-b",
        action: "update",
        entityType: "account",
        entityId: account.id,
        baseVersion: account.version,
        patch: { name: "Cambio B" },
      })),
    ]);

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["applied", "conflict"]);
    const reloaded = await runWithDb(testDb.db, accountsRepository.get(principal.userId, account.id));
    expect(reloaded?.version).toBe(account.version + 1);
    expect(["Cambio A", "Cambio B"]).toContain(reloaded?.name);
  });

  it("returns a 409 with a conflict body shape on a version mismatch, and halts remaining commands", async () => {
    const account = await runWithDb(testDb.db, accountsRepository.create(principal.userId, {
      name: "Cuenta",
      kind: "cash",
      currency: "EUR",
      openingBalance: 0,
    }));
    expect(account.version).toBe(1);

    const { POST } = await import("../../../../src/pages/api/sync");
    const response = await POST({
      request: postJson("https://example.test/api/sync", {
        commands: [
          {
            commandId: "update-stale",
            action: "update",
            entityType: "account",
            entityId: account.id,
            baseVersion: 999, // stale on purpose
            patch: { name: "Renombrada" },
          },
          {
            commandId: "should-not-run",
            action: "noop",
          },
        ],
      }),
      locals: { principal },
    } as never);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({
      commandId: "update-stale",
      status: "conflict",
      currentVersion: 1,
    });
    expect(body.halted).toBe(true);

    // The account was not mutated.
    const reloaded = await runWithDb(testDb.db, accountsRepository.get(principal.userId, account.id));
    expect(reloaded?.name).toBe("Cuenta");
  });
});
