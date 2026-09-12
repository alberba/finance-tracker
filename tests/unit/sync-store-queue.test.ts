import "fake-indexeddb/auto";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/scripts/demo-mode", () => ({ isDemoMode: vi.fn(() => false) }));

import { listAll, openOutbox } from "../../src/lib/client/outbox";
import { useSyncStore } from "../../src/stores/sync";

const EMPTY_BOOTSTRAP = {
  revision: 0, settings: null, accounts: [], categories: [], transactions: [], subscriptions: [],
  recurringRules: [], pendingMovements: [], budgetEntries: [], goals: [], contributions: [],
  userInstruments: [], wealthSnapshots: [],
};

type SyncHandler = (commands: Array<{ commandId: string }>) => Response;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let userCounter = 0;

describe("useSyncStore — queue never stays poisoned (audit §2)", () => {
  let onSync: SyncHandler;
  let changes: unknown[];
  let userId: string;

  beforeEach(() => {
    vi.stubEnv("PUBLIC_SYNC_V2", "true");
    vi.stubGlobal("navigator", { onLine: true });
    setActivePinia(createPinia());
    userCounter += 1;
    userId = `queue-user-${userCounter}`;
    changes = [];
    onSync = (commands) => json({ results: commands.map((c) => ({ commandId: c.commandId, status: "noop" })), revision: 0, halted: false });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/bootstrap") return json(EMPTY_BOOTSTRAP);
      if (url.startsWith("/api/changes")) return json({ revision: changes.length, changes });
      if (url === "/api/sync") return onSync(JSON.parse(String(init?.body)).commands);
      throw new Error(`unexpected fetch ${url}`);
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function queued() {
    const db = await openOutbox(userId);
    try {
      return await listAll(db);
    } finally {
      db.close();
    }
  }

  it("drops a command the server rejects and keeps flushing the rest", async () => {
    onSync = (commands) => json({
      results: commands.map((c, i) => i === 0
        ? { commandId: c.commandId, status: "rejected", message: "La cuenta indicada no existe" }
        : { commandId: c.commandId, status: "noop" }),
      revision: 0, halted: false,
    });
    const store = useSyncStore();
    await store.init(userId);

    await store.enqueueCommand({ action: "noop" });
    await vi.waitFor(async () => expect(await queued()).toHaveLength(0));
    expect(store.lastError).toContain("La cuenta indicada no existe");
  });

  it("discards the head entry after repeated server failures so later commands can sync", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    onSync = () => json({ error: "Error interno del servidor." }, 500);
    const store = useSyncStore();
    await store.init(userId);

    await store.enqueueCommand({ action: "noop", commandId: "poison" });
    for (let attempt = 0; attempt < 10 && (await queued()).some((e) => e.command.commandId === "poison"); attempt += 1) {
      await vi.runOnlyPendingTimersAsync();
      await vi.waitFor(async () => expect(store.syncStatus).not.toBe("syncing"));
    }

    expect((await queued()).some((e) => e.command.commandId === "poison")).toBe(false);
    expect(store.lastError).toBeTruthy();
  });

  it("ignores pulled changes for stores the local cache does not have (userSettings)", async () => {
    changes = [{ entityType: "userSettings", entityId: userId, changeType: "update", payload: JSON.stringify({ currency: "USD" }) }];
    const store = useSyncStore();
    await expect(store.init(userId)).resolves.toBeUndefined();
    expect(store.revision).toBe(1);
  });

  it("keepLocal re-sends the update against the server's currentVersion", async () => {
    const sent: Array<{ baseVersion?: number }> = [];
    onSync = (commands) => {
      sent.push(...(commands as Array<{ baseVersion?: number }>));
      return json({
        results: commands.map((c) => ({ commandId: c.commandId, status: "conflict", currentVersion: 7 })),
        revision: 0, halted: true,
      }, 409);
    };
    const store = useSyncStore();
    await store.init(userId);
    await store.enqueueCommand({ action: "update", entityType: "account", entityId: "acc-1", baseVersion: 3, patch: { name: "x" } });
    await vi.waitFor(() => expect(store.conflicts).toHaveLength(1));

    onSync = (commands) => {
      sent.push(...(commands as Array<{ baseVersion?: number }>));
      return json({ results: commands.map((c) => ({ commandId: c.commandId, status: "applied" })), revision: 1, halted: false });
    };
    await store.resolveConflict(store.conflicts[0].seq, "keepLocal");
    await vi.waitFor(() => expect(sent.at(-1)?.baseVersion).toBe(7));
  });
});
