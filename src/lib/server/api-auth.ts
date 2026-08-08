/**
 * Shared auth guard for the WP4 v2 API surface.
 *
 * Unlike the rest of the app (where `AUTH_ENFORCED` gates whether a missing
 * Cf-Access header blocks a request — see `src/middleware.ts`), every route
 * under this WP4 file list requires `Astro.locals.principal` unconditionally:
 * these are brand-new endpoints with no existing client depending on them,
 * so there is no backwards-compatibility reason to allow anonymous access.
 * "401 if absent for these new routes regardless of AUTH_ENFORCED" per the
 * work-package spec.
 */

import type { AuthPrincipal } from "./auth/principal";

export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export class UnauthorizedError extends Error {}

/** Returns the request's `AuthPrincipal`, or throws `UnauthorizedError` if absent. */
export function requirePrincipal(locals: App.Locals): AuthPrincipal {
  const principal = locals.principal;
  if (!principal) {
    throw new UnauthorizedError("Se requiere autenticación (Astro.locals.principal ausente).");
  }
  return principal;
}

/** Wraps a route handler body, turning `UnauthorizedError`/generic errors into JSON responses. */
export async function withApiErrorHandling(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return jsonResponse({ error: error.message }, 401);
    }
    const message = error instanceof Error ? error.message : "Error interno";
    return jsonResponse({ error: message }, 500);
  }
}
