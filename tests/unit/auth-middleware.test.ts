import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * WP3 acceptance criteria:
 * - unit tests for JWT valid/expired/invalid/wrong-audience (`verifyAccessJwt`
 *   suite below, exercised through `jose`'s real typed errors).
 * - `AuthPrincipal` provisioning: first-auth creates `users` +
 *   `user_identities` transactionally, repeat logins are a no-op, and the
 *   legacy-owner email match links instead of creating a new user
 *   (`resolvePrincipal` suite below).
 * - `src/middleware.ts`: `AUTH_ENFORCED` defaults to off (existing
 *   unauthenticated routes must keep working) and only blocks with a `401`
 *   when explicitly `"true"` (`middleware onRequest` suite below, exercised
 *   end-to-end through the *real* `verifyAccessJwt`/`resolvePrincipal`, only
 *   `jose` and the D1 binding are faked). The E2E smoke test called for in
 *   the WP plan lives in a later WP (WP10's security suite) — out of scope
 *   for this unit-test file.
 *
 * Only `jose` (network-calling JWKS fetch) and `src/db/client` (the D1
 * binding) are mocked anywhere in this file — deliberately never the two
 * `src/lib/server/auth/*` modules under test themselves, since `vi.mock`
 * calls are hoisted to the top of the file and would otherwise shadow the
 * real implementations imported by the earlier describe blocks too.
 */

import * as jose from "jose";

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "fake-jwks"),
  jwtVerify: vi.fn(),
}));

vi.mock("../../src/db/client", () => ({
  getDb: vi.fn(),
}));

import { verifyAccessJwt } from "../../src/lib/server/auth/jwks";
import { users, userIdentities } from "../../src/db/schema";
import { resolvePrincipal, CF_ACCESS_PROVIDER } from "../../src/lib/server/auth/principal";
import { getDb } from "../../src/db/client";
import { onRequest } from "../../src/middleware";

beforeEach(() => {
  vi.mocked(jose.jwtVerify).mockReset();
  vi.mocked(getDb).mockReset();
});

// ---------------------------------------------------------------------------
// jwks.ts — Cf-Access JWT verification
// ---------------------------------------------------------------------------

describe("verifyAccessJwt", () => {
  it("returns sub/email for a valid token", async () => {
    vi.mocked(jose.jwtVerify).mockResolvedValue({
      payload: { sub: "user-sub-1", email: "person@example.com" },
    } as never);

    const claims = await verifyAccessJwt("valid.jwt.token", {
      teamDomain: "team-valid.cloudflareaccess.com",
      audience: "aud-123",
    });

    expect(claims).toEqual({ sub: "user-sub-1", email: "person@example.com" });
    expect(jose.jwtVerify).toHaveBeenCalledWith(
      "valid.jwt.token",
      "fake-jwks",
      expect.objectContaining({
        issuer: "https://team-valid.cloudflareaccess.com",
        audience: "aud-123",
      }),
    );
  });

  it("reuses the cached JWKS across calls for the same team domain", async () => {
    vi.mocked(jose.jwtVerify).mockResolvedValue({ payload: { sub: "sub" } } as never);
    const config = { teamDomain: "team-cache-test.cloudflareaccess.com", audience: "aud-123" };
    const callsBefore = vi.mocked(jose.createRemoteJWKSet).mock.calls.length;

    await verifyAccessJwt("token-a", config);
    await verifyAccessJwt("token-b", config);

    expect(vi.mocked(jose.createRemoteJWKSet).mock.calls.length - callsBefore).toBe(1);
  });

  it("propagates expiration errors", async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValue(
      Object.assign(new Error("exp claim timestamp check failed"), {
        code: "ERR_JWT_EXPIRED",
      }),
    );

    await expect(
      verifyAccessJwt("expired.jwt", {
        teamDomain: "team-expired.cloudflareaccess.com",
        audience: "aud-123",
      }),
    ).rejects.toThrow(/exp claim/i);
  });

  it("propagates invalid-signature errors", async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValue(
      Object.assign(new Error("signature verification failed"), {
        code: "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
      }),
    );

    await expect(
      verifyAccessJwt("tampered.jwt", {
        teamDomain: "team-invalid.cloudflareaccess.com",
        audience: "aud-123",
      }),
    ).rejects.toThrow(/signature/i);
  });

  it("propagates wrong-audience errors", async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValue(
      Object.assign(new Error('unexpected "aud" claim value'), {
        code: "ERR_JWT_CLAIM_VALIDATION_FAILED",
        claim: "aud",
      }),
    );

    await expect(
      verifyAccessJwt("wrong-aud.jwt", {
        teamDomain: "team-wrong-aud.cloudflareaccess.com",
        audience: "aud-123",
      }),
    ).rejects.toThrow(/aud/i);
  });

  it("rejects a token whose payload has no 'sub' claim", async () => {
    vi.mocked(jose.jwtVerify).mockResolvedValue({ payload: {} } as never);

    await expect(
      verifyAccessJwt("no-sub.jwt", {
        teamDomain: "team-no-sub.cloudflareaccess.com",
        audience: "aud-123",
      }),
    ).rejects.toThrow(/sub/i);
  });
});

// ---------------------------------------------------------------------------
// principal.ts / legacy-owner-link.ts — AuthPrincipal provisioning
// ---------------------------------------------------------------------------

/**
 * Minimal fake Drizzle query builder covering exactly the chain shapes used
 * by `principal.ts`/`legacy-owner-link.ts`: `select().from().innerJoin?()
 * .where().limit()`, `insert().values().returning()`, and `transaction()`.
 * Dispatches by table identity (the real schema table objects, imported
 * above) rather than re-implementing SQL — good enough for a unit test;
 * WP5's real-D1 tier (out of scope here) exercises the real SQL.
 */
function createFakeDb(options: {
  identityLookupResult: unknown[];
  legacyOwnerLookupResult?: unknown[];
  insertedUser?: { id: string; email: string };
}) {
  const insertCalls: { table: unknown; values: unknown }[] = [];

  function chain(result: unknown[]) {
    const node = {
      from: () => node,
      innerJoin: () => node,
      where: () => node,
      limit: () => node,
      then: (resolve: (v: unknown[]) => unknown) => Promise.resolve(result).then(resolve),
    };
    return node;
  }

  function makeDb(): unknown {
    return {
      select: () => ({
        from: (table: unknown) => {
          if (table === userIdentities) {
            return chain(options.identityLookupResult);
          }
          if (table === users) {
            return chain(options.legacyOwnerLookupResult ?? []);
          }
          return chain([]);
        },
      }),
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          insertCalls.push({ table, values });
          return {
            returning: () => Promise.resolve([options.insertedUser]),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(undefined).then(resolve),
          };
        },
      }),
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(makeDb()),
    };
  }

  return { db: makeDb(), insertCalls };
}

describe("resolvePrincipal", () => {
  it("is idempotent: an existing identity short-circuits without any writes", async () => {
    const { db, insertCalls } = createFakeDb({
      identityLookupResult: [
        { userId: "existing-user", email: "person@example.com", isLegacyOwner: 0 },
      ],
    });

    const principal = await resolvePrincipal(db as never, {
      provider: CF_ACCESS_PROVIDER,
      subject: "sub-1",
      email: "person@example.com",
    });

    expect(principal).toEqual({
      userId: "existing-user",
      email: "person@example.com",
      provider: CF_ACCESS_PROVIDER,
      subject: "sub-1",
      isLegacyOwner: false,
    });
    expect(insertCalls).toHaveLength(0);
  });

  it("creates a new user + identity on first auth (no legacy match)", async () => {
    const { db, insertCalls } = createFakeDb({
      identityLookupResult: [],
      legacyOwnerLookupResult: [],
      insertedUser: { id: "new-user-id", email: "new@example.com" },
    });

    const principal = await resolvePrincipal(db as never, {
      provider: CF_ACCESS_PROVIDER,
      subject: "sub-2",
      email: "new@example.com",
      legacyOwnerEmail: "legacy@example.com",
    });

    expect(principal).toEqual({
      userId: "new-user-id",
      email: "new@example.com",
      provider: CF_ACCESS_PROVIDER,
      subject: "sub-2",
      isLegacyOwner: false,
    });
    expect(insertCalls.map((c) => c.table)).toEqual([users, userIdentities]);
  });

  it("links to the reserved legacy-owner user instead of creating a new one", async () => {
    const { db, insertCalls } = createFakeDb({
      identityLookupResult: [],
      legacyOwnerLookupResult: [{ id: "legacy-user-id", email: "legacy@example.com" }],
    });

    const principal = await resolvePrincipal(db as never, {
      provider: CF_ACCESS_PROVIDER,
      subject: "sub-3",
      email: "legacy@example.com",
      legacyOwnerEmail: "legacy@example.com",
    });

    expect(principal.userId).toBe("legacy-user-id");
    expect(principal.isLegacyOwner).toBe(true);
    // Only the identity insert happens — no new `users` row.
    expect(insertCalls.map((c) => c.table)).toEqual([userIdentities]);
  });

  it("does not link when the authenticated email differs from LEGACY_OWNER_EMAIL", async () => {
    const { db, insertCalls } = createFakeDb({
      identityLookupResult: [],
      legacyOwnerLookupResult: [{ id: "legacy-user-id", email: "legacy@example.com" }],
      insertedUser: { id: "brand-new-id", email: "someone-else@example.com" },
    });

    const principal = await resolvePrincipal(db as never, {
      provider: CF_ACCESS_PROVIDER,
      subject: "sub-4",
      email: "someone-else@example.com",
      legacyOwnerEmail: "legacy@example.com",
    });

    expect(principal.userId).toBe("brand-new-id");
    expect(principal.isLegacyOwner).toBe(false);
    expect(insertCalls.map((c) => c.table)).toEqual([users, userIdentities]);
  });
});

// ---------------------------------------------------------------------------
// middleware.ts — AUTH_ENFORCED gating (real verifyAccessJwt + resolvePrincipal)
// ---------------------------------------------------------------------------

function makeContext(options: { headers?: Record<string, string>; env?: Record<string, string> }) {
  const request = new Request("https://app.example.com/api/state", {
    headers: options.headers,
  });
  const locals: Record<string, unknown> = {
    runtime: { env: options.env ?? {} },
  };
  return { request, locals } as unknown as Parameters<typeof onRequest>[0];
}

function makeNext(response: Response) {
  return vi.fn(() => Promise.resolve(response)) as unknown as Parameters<typeof onRequest>[1];
}

const CONFIGURED_ENV = {
  CF_ACCESS_TEAM_DOMAIN: "team-mw.cloudflareaccess.com",
  CF_ACCESS_AUD: "aud-123",
};

describe("middleware onRequest — AUTH_ENFORCED gating", () => {
  it("lets unauthenticated requests through when AUTH_ENFORCED is unset (default off)", async () => {
    const context = makeContext({ env: CONFIGURED_ENV });
    const next = makeNext(new Response("ok"));

    const response = (await onRequest(context, next)) as Response;

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toBe(401);
    expect((context.locals as { principal?: unknown }).principal).toBeUndefined();
    expect(jose.jwtVerify).not.toHaveBeenCalled();
  });

  it("returns 401 without calling next() when AUTH_ENFORCED=true and no header is sent", async () => {
    const context = makeContext({ env: { ...CONFIGURED_ENV, AUTH_ENFORCED: "true" } });
    const next = makeNext(new Response("ok"));

    const response = (await onRequest(context, next)) as Response;

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
  });

  it("attaches locals.principal on a valid token and calls next()", async () => {
    vi.mocked(jose.jwtVerify).mockResolvedValue({
      payload: { sub: "sub-mw-1", email: "a@b.com" },
    } as never);
    const { db } = createFakeDb({
      identityLookupResult: [{ userId: "user-1", email: "a@b.com", isLegacyOwner: 0 }],
    });
    vi.mocked(getDb).mockReturnValue(db as never);

    const context = makeContext({
      headers: { "Cf-Access-Jwt-Assertion": "a.valid.jwt" },
      env: CONFIGURED_ENV,
    });
    const next = makeNext(new Response("ok"));

    await onRequest(context, next);

    expect((context.locals as { principal?: unknown }).principal).toEqual({
      userId: "user-1",
      email: "a@b.com",
      provider: CF_ACCESS_PROVIDER,
      subject: "sub-mw-1",
      isLegacyOwner: false,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("does not block when AUTH_ENFORCED is off and the token is invalid/expired", async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValue(
      Object.assign(new Error("exp claim timestamp check failed"), { code: "ERR_JWT_EXPIRED" }),
    );
    const context = makeContext({
      headers: { "Cf-Access-Jwt-Assertion": "an.expired.jwt" },
      env: CONFIGURED_ENV,
    });
    const next = makeNext(new Response("ok"));

    const response = (await onRequest(context, next)) as Response;

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toBe(401);
    expect((context.locals as { principal?: unknown }).principal).toBeUndefined();
  });

  it("returns 401 when AUTH_ENFORCED=true and the token is invalid (wrong audience)", async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValue(
      Object.assign(new Error('unexpected "aud" claim value'), {
        code: "ERR_JWT_CLAIM_VALIDATION_FAILED",
      }),
    );
    const context = makeContext({
      headers: { "Cf-Access-Jwt-Assertion": "a.bad.jwt" },
      env: { ...CONFIGURED_ENV, AUTH_ENFORCED: "true" },
    });
    const next = makeNext(new Response("ok"));

    const response = (await onRequest(context, next)) as Response;

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
  });

  it("treats a missing Cf-Access configuration like 'no token' when not enforced", async () => {
    const context = makeContext({
      headers: { "Cf-Access-Jwt-Assertion": "a.valid.jwt" },
      env: {},
    });
    const next = makeNext(new Response("ok"));

    const response = (await onRequest(context, next)) as Response;

    expect(jose.jwtVerify).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toBe(401);
  });

  it("returns 401 for a missing Cf-Access configuration when enforced", async () => {
    const context = makeContext({
      headers: { "Cf-Access-Jwt-Assertion": "a.valid.jwt" },
      env: { AUTH_ENFORCED: "true" },
    });
    const next = makeNext(new Response("ok"));

    const response = (await onRequest(context, next)) as Response;

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// middleware.ts — test-only principal injection (WP8, `X-Test-User-Email`)
// ---------------------------------------------------------------------------

describe("middleware onRequest — test-auth shim (TEST_AUTH_ENABLED)", () => {
  it("ignores the test header when TEST_AUTH_ENABLED is unset (default off)", async () => {
    const { db } = createFakeDb({ identityLookupResult: [] });
    vi.mocked(getDb).mockReturnValue(db as never);

    const context = makeContext({
      headers: { "X-Test-User-Email": "tester@example.com" },
      env: {},
    });
    const next = makeNext(new Response("ok"));

    await onRequest(context, next);

    expect((context.locals as { principal?: unknown }).principal).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("resolves a principal from the test header when explicitly enabled and not enforced", async () => {
    const { db, insertCalls } = createFakeDb({
      identityLookupResult: [],
      legacyOwnerLookupResult: [],
      insertedUser: { id: "test-user-id", email: "tester@example.com" },
    });
    vi.mocked(getDb).mockReturnValue(db as never);

    const context = makeContext({
      headers: { "X-Test-User-Email": "Tester@Example.com" },
      env: { TEST_AUTH_ENABLED: "true" },
    });
    const next = makeNext(new Response("ok"));

    await onRequest(context, next);

    expect((context.locals as { principal?: unknown }).principal).toMatchObject({
      userId: "test-user-id",
      email: "tester@example.com",
    });
    expect(jose.jwtVerify).not.toHaveBeenCalled();
    expect(insertCalls.map((c) => c.table)).toEqual([users, userIdentities]);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("never honors the test header when AUTH_ENFORCED=true, even if TEST_AUTH_ENABLED is also true", async () => {
    const context = makeContext({
      headers: { "X-Test-User-Email": "tester@example.com" },
      env: { AUTH_ENFORCED: "true", TEST_AUTH_ENABLED: "true" },
    });
    const next = makeNext(new Response("ok"));

    const response = (await onRequest(context, next)) as Response;

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
    expect((context.locals as { principal?: unknown }).principal).toBeUndefined();
  });

  it("falls through to the normal Cf-Access flow when the test header is absent, even if enabled", async () => {
    const context = makeContext({
      env: { TEST_AUTH_ENABLED: "true" },
    });
    const next = makeNext(new Response("ok"));

    const response = (await onRequest(context, next)) as Response;

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).not.toBe(401);
    expect((context.locals as { principal?: unknown }).principal).toBeUndefined();
  });
});
