import { describe, expect, it } from "vitest";
import {
  entityCreateSchemas,
  entityUpdateSchemas,
  syncBatchSchema,
  syncCommandSchema,
} from "../../src/lib/server/sync/command-schemas";

describe("syncCommandSchema", () => {
  it("accepts a valid create command", () => {
    const result = syncCommandSchema.safeParse({
      commandId: "cmd-1",
      action: "create",
      entityType: "account",
      data: { name: "Cuenta", kind: "cash", currency: "EUR", openingBalance: 10 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid update command with baseVersion", () => {
    const result = syncCommandSchema.safeParse({
      commandId: "cmd-2",
      action: "update",
      entityType: "goal",
      entityId: "goal-1",
      baseVersion: 3,
      patch: { name: "Nuevo nombre" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid remove command", () => {
    const result = syncCommandSchema.safeParse({
      commandId: "cmd-3",
      action: "remove",
      entityType: "transaction",
      entityId: "tx-1",
      baseVersion: 1,
    });
    expect(result.success).toBe(true);
  });

  it("accepts settingsUpdate and noop commands", () => {
    expect(
      syncCommandSchema.safeParse({
        commandId: "cmd-4",
        action: "settingsUpdate",
        patch: { currency: "USD" },
      }).success,
    ).toBe(true);
    expect(syncCommandSchema.safeParse({ commandId: "cmd-5", action: "noop" }).success).toBe(true);
  });

  it("rejects an unknown entityType", () => {
    const result = syncCommandSchema.safeParse({
      commandId: "cmd-6",
      action: "create",
      entityType: "notARealEntity",
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects an update command missing baseVersion", () => {
    const result = syncCommandSchema.safeParse({
      commandId: "cmd-7",
      action: "update",
      entityType: "account",
      entityId: "acc-1",
      patch: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown action", () => {
    const result = syncCommandSchema.safeParse({ commandId: "cmd-8", action: "delete-everything" });
    expect(result.success).toBe(false);
  });
});

describe("syncBatchSchema", () => {
  it("accepts a batch of up to 5 commands", () => {
    const commands = Array.from({ length: 5 }, (_, i) => ({ commandId: `cmd-${i}`, action: "noop" as const }));
    expect(syncBatchSchema.safeParse({ commands }).success).toBe(true);
  });

  it("rejects a batch of 6 commands", () => {
    const commands = Array.from({ length: 6 }, (_, i) => ({ commandId: `cmd-${i}`, action: "noop" as const }));
    expect(syncBatchSchema.safeParse({ commands }).success).toBe(false);
  });

  it("rejects an empty batch", () => {
    expect(syncBatchSchema.safeParse({ commands: [] }).success).toBe(false);
  });
});

describe("entityCreateSchemas / entityUpdateSchemas are strict (issue #138)", () => {
  it("rejects a create payload carrying a field the entity doesn't declare", () => {
    const result = entityCreateSchemas.account.safeParse({
      name: "Cuenta",
      kind: "cash",
      currency: "EUR",
      openingBalance: 0,
      bogusField: "no destino",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an update payload carrying a field the entity doesn't declare", () => {
    const result = entityUpdateSchemas.account.safeParse({
      name: "Nueva",
      bogusField: "no destino",
    });
    expect(result.success).toBe(false);
  });

  it("still accepts a payload using only declared fields", () => {
    const result = entityCreateSchemas.transaction.safeParse({
      accountId: "acc-1",
      type: "expense",
      date: "2026-01-01",
      amount: 10,
      currency: "EUR",
    });
    expect(result.success).toBe(true);
  });

  it("keeps the narrower budgetEntry update schema strict too", () => {
    const result = entityUpdateSchemas.budgetEntry.safeParse({
      amount: 100,
      categoryId: "not-allowed-here",
    });
    expect(result.success).toBe(false);
  });
});
