/**
 * Astro middleware (WP3) — new subsystem, no prior `src/middleware.ts`
 * existed before this WP (see `docs/migration/work-packages.md` Contradiction
 * #1).
 *
 * Validates the `Cf-Access-Jwt-Assertion` header against Cloudflare Access'
 * JWKS (issuer + audience checked) and, on success, resolves/provisions the
 * `AuthPrincipal` onto `Astro.locals.principal`.
 *
 * **Enforcement is gated behind `AUTH_ENFORCED`** (see `cloudflare-env.ts`),
 * defaulting to off:
 * - `AUTH_ENFORCED !== "true"` (today, everywhere): the middleware still
 *   attempts verification and attaches `locals.principal` when a valid
 *   header is present, but a missing/invalid/expired token never blocks the
 *   request — every existing unauthenticated route keeps working exactly as
 *   before this WP. This is intentional: cutover to hard enforcement is a
 *   later step (WP11) that happens once every route consumes
 *   `locals.principal` instead of the `x-finance-namespace` header.
 * - `AUTH_ENFORCED === "true"`: a missing/invalid header yields a `401`
 *   before `next()` is ever called.
 *
 * ## Test-only principal injection (WP8)
 *
 * Real Cf-Access JWTs cannot be minted in Playwright/CI. WP4's new v2 routes
 * (`requirePrincipal` in `api-auth.ts`) require `Astro.locals.principal`
 * *unconditionally*, regardless of `AUTH_ENFORCED` — so without a way to
 * inject a principal in tests, every v2 route 401s in e2e/dev. The
 * `X-Test-User-Email` header lets `tests/e2e/fixtures.ts` (and only that,
 * or a local dev session) provision/select a principal directly, bypassing
 * Cf-Access entirely, but **only** when both of the following hold:
 * - `AUTH_ENFORCED !== "true"` (same gate as everything else here — real
 *   enforced environments never look at this header at all), AND
 * - `TEST_AUTH_ENABLED === "true"` — a second, independent flag that must
 *   be set explicitly (`.dev.vars` locally, an ephemeral CI env var — see
 *   `.dev.vars.example`). It must **never** be set in `wrangler.toml`
 *   `[vars]` or any deployed/staging environment: unlike `AUTH_ENFORCED`
 *   (which is expected to be off pre-cutover in real deployments too), this
 *   flag alone would let any caller impersonate any user by email.
 */

// `astro/middleware` is the real package export backing the `astro:middleware`
// virtual module; importing it directly (rather than the virtual specifier)
// keeps this file resolvable under plain Vitest, which doesn't run Astro's
// Vite pipeline (see `tests/unit/auth-middleware.test.ts`).
import { defineMiddleware } from "astro/middleware";
import { verifyAccessJwt } from "./lib/server/auth/jwks";
import { resolvePrincipal, CF_ACCESS_PROVIDER } from "./lib/server/auth/principal";
import { getDb } from "./db/client";
import type { RuntimeEnv } from "./lib/server/cloudflare-env";

const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";
/** Test-only principal injection (WP8) — see the module doc comment above. */
export const TEST_USER_EMAIL_HEADER = "X-Test-User-Email";
/** Dedicated provider tag for identities created through the test header, kept distinct from `CF_ACCESS_PROVIDER` for auditability. */
export const TEST_AUTH_PROVIDER = "e2e-test-header";

function jsonUnauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function isEnforced(env: RuntimeEnv | undefined): boolean {
  return env?.AUTH_ENFORCED === "true";
}

function isTestAuthEnabled(env: RuntimeEnv | undefined): boolean {
  return env?.TEST_AUTH_ENABLED === "true";
}

export const onRequest = defineMiddleware(async (context, next) => {
  const env = (context.locals as { runtime?: { env?: RuntimeEnv } })?.runtime?.env;
  const enforced = isEnforced(env);

  // Test-only shim: only ever consulted when enforcement is off AND the
  // deployment explicitly opted in via `TEST_AUTH_ENABLED` — see doc comment.
  if (!enforced && isTestAuthEnabled(env)) {
    const testEmail = context.request.headers.get(TEST_USER_EMAIL_HEADER)?.trim().toLowerCase();
    if (testEmail) {
      try {
        const db = getDb(context.locals);
        context.locals.principal = await resolvePrincipal(db, {
          provider: TEST_AUTH_PROVIDER,
          subject: testEmail,
          email: testEmail,
          legacyOwnerEmail: env?.LEGACY_OWNER_EMAIL ?? null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo resolver el principal de prueba.";
        console.warn(`[middleware] test-auth-shim failed: ${message}`);
      }
      return next();
    }
  }

  const token = context.request.headers.get(ACCESS_JWT_HEADER);

  if (!token) {
    return enforced ? jsonUnauthorized("Falta la cabecera Cf-Access-Jwt-Assertion.") : next();
  }

  const teamDomain = env?.CF_ACCESS_TEAM_DOMAIN;
  const audience = env?.CF_ACCESS_AUD;
  if (!teamDomain || !audience) {
    // Not configured yet: can't verify, so treat like "no token" rather than
    // hard-failing every request in dev/local environments.
    return enforced
      ? jsonUnauthorized("Cf-Access no está configurado en este entorno.")
      : next();
  }

  try {
    const claims = await verifyAccessJwt(token, { teamDomain, audience });
    const db = getDb(context.locals);
    context.locals.principal = await resolvePrincipal(db, {
      provider: CF_ACCESS_PROVIDER,
      subject: claims.sub,
      email: claims.email ?? null,
      legacyOwnerEmail: env?.LEGACY_OWNER_EMAIL ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token de Cf-Access inválido.";
    if (enforced) {
      return jsonUnauthorized(message);
    }
    // Not enforced yet: log and continue unauthenticated rather than break
    // the request, per this WP's cutover-safety design decision.
    console.warn(`[middleware] Cf-Access verification failed: ${message}`);
  }

  return next();
});
