/**
 * `POST /api/state/reset-legacy` (WP8) — the namespace-based reset that used
 * to live at `POST /api/state/reset` before WP4 repurposed that path for the
 * v2, principal-based "empezar de cero"/wipe semantics (see
 * `src/pages/api/state/reset.ts`).
 *
 * The legacy client (`PUBLIC_SYNC_V2` off, the default — `src/scripts/state.ts`
 * + `x-finance-namespace`) never called `/api/state/reset` itself (it has no
 * "wipe namespace" UI action), but `tests/e2e/fixtures.ts` and
 * `tests/e2e/demo-mode.spec.ts` did, purely to force a clean/reseeded
 * namespace row before a test run. WP4 silently broke that call (the new
 * `/api/state/reset` now 401s without a principal) without providing a
 * replacement — this route restores it under its own path, using the exact
 * same `resetStateInD1` helper the old handler used, so it can keep serving
 * that one purpose without touching WP4's new v2 semantics at the shared
 * `/api/state/reset` path.
 *
 * Deliberately NOT gated by `Astro.locals.principal` — this is unauthenticated
 * exactly like the rest of the legacy `/api/state*` surface it resets.
 */

import type { APIRoute } from "astro";
import { getD1FromLocals } from "../../../lib/server/cloudflare-env";
import { resetStateInD1 } from "../../../lib/server/d1-state";

function requestNamespace(request: Request): string | undefined {
  const header = request.headers.get("x-finance-namespace");
  return header || undefined;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const db = getD1FromLocals(locals);
    const snapshot = await resetStateInD1(db, requestNamespace(request));
    return new Response(
      JSON.stringify({
        ok: true,
        state: snapshot.state,
        version: snapshot.version,
        updatedAt: snapshot.updatedAt,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo reiniciar el estado";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
