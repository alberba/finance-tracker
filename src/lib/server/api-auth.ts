/** Shared API authentication, authorization and private JSON responses. */

import type { AuthPrincipal } from "./auth/principal";
import { reportApiRouteFailure } from "./error-tracking";

export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

/** Returns the request's `AuthPrincipal`, or throws `UnauthorizedError` if absent. */
export function requirePrincipal(locals: App.Locals): AuthPrincipal {
  const principal = locals.principal;
  if (!principal) {
    throw new UnauthorizedError("Se requiere autenticación (Astro.locals.principal ausente).");
  }
  return principal;
}

/** Temporary cutover guard: only the reserved owner may touch the v1 blob. */
export function requireLegacyOwner(locals: App.Locals): AuthPrincipal {
  const principal = requirePrincipal(locals);
  if (!principal.isLegacyOwner) {
    throw new ForbiddenError("El estado legacy solo está disponible para su propietario.");
  }
  return principal;
}

/**
 * Wraps a route handler body, turning `UnauthorizedError`/generic errors into
 * JSON responses. `UnauthorizedError`/`ForbiddenError` are handled outcomes and
 * stay out of Sentry; anything else is reported as an unhandled route failure.
 */
export async function withApiErrorHandling(
  route: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return jsonResponse({ error: error.message }, 401);
    }
    if (error instanceof ForbiddenError) {
      return jsonResponse({ error: error.message }, 403);
    }
    console.error(`[api] Unhandled route error in ${route}`, error);
    reportApiRouteFailure(error, { route, status: 500 });
    return jsonResponse({ error: "Error interno del servidor." }, 500);
  }
}
