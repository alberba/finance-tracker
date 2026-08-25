import { describe, expect, it } from "vitest";

import { GET, PUT } from "../../../src/pages/api/state";
import { POST as resetLegacy } from "../../../src/pages/api/state/reset-legacy";
import {
  loadStateFromD1,
  saveStateToD1,
  type D1DatabaseLike,
  type D1StatementLike,
} from "../../../src/lib/server/d1-state";
import type { AuthPrincipal } from "../../../src/lib/server/auth/principal";

type Row = { id: string; payload: string; updated_at: string; version: number };

function createFakeD1(): D1DatabaseLike {
  const rows = new Map<string, Row>();
  return {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const statement: D1StatementLike = {
        bind(...values: unknown[]) {
          bound = values;
          return statement;
        },
        async first() {
          return sql.includes("SELECT") ? rows.get(String(bound[0])) ?? null : null;
        },
        async run() {
          if (sql.includes("INSERT INTO app_state")) {
            const [id, payload, updatedAt, version] = bound;
            rows.set(String(id), {
              id: String(id),
              payload: String(payload),
              updated_at: String(updatedAt),
              version: Number(version),
            });
          }
          return null;
        },
      };
      return statement;
    },
  };
}

function principal(isLegacyOwner: boolean): AuthPrincipal {
  return {
    userId: isLegacyOwner ? "owner" : "other-user",
    email: "user@example.com",
    provider: "test",
    subject: "subject",
    isLegacyOwner,
  };
}

function locals(db: D1DatabaseLike, authPrincipal?: AuthPrincipal): App.Locals {
  return {
    principal: authPrincipal,
    runtimeEnv: { finance_tracker_db: db },
  } as unknown as App.Locals;
}

describe("legacy state authorization", () => {
  it("rejects requests without an authenticated principal", async () => {
    const response = await GET({ locals: locals(createFakeD1()) } as never);
    expect(response.status).toBe(401);
  });

  it("rejects authenticated users who are not the reserved legacy owner", async () => {
    const response = await GET({ locals: locals(createFakeD1(), principal(false)) } as never);
    expect(response.status).toBe(403);
  });

  it("ignores client namespaces and always reads the owner's default blob", async () => {
    const db = createFakeD1();
    await saveStateToD1(db, "default", { owner: true }, undefined);
    await saveStateToD1(db, "attacker-selected", { secret: true }, undefined);

    const response = await GET({
      request: new Request("https://app.example/api/state", {
        headers: { "x-finance-namespace": "attacker-selected" },
      }),
      locals: locals(db, principal(true)),
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: { owner: true } });
  });

  it("ignores client namespaces for writes and legacy resets", async () => {
    const db = createFakeD1();
    await saveStateToD1(db, "attacker-selected", { untouched: true }, undefined);
    const ownerLocals = locals(db, principal(true));

    const writeResponse = await PUT({
      request: new Request("https://app.example/api/state", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-finance-namespace": "attacker-selected",
        },
        body: JSON.stringify({ state: { owner: true } }),
      }),
      locals: ownerLocals,
    } as never);
    expect(writeResponse.status).toBe(200);

    const resetResponse = await resetLegacy({
      request: new Request("https://app.example/api/state/reset-legacy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-finance-namespace": "attacker-selected",
        },
        body: "{}",
      }),
      locals: ownerLocals,
    } as never);
    expect(resetResponse.status).toBe(200);

    expect((await loadStateFromD1(db, "attacker-selected")).state).toEqual({ untouched: true });
  });
});
