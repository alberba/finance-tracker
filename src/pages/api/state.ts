import type { APIRoute } from "astro";
import { getD1FromLocals } from "../../lib/server/cloudflare-env";
import { loadStateFromD1, saveStateToD1 } from "../../lib/server/d1-state";
import {
  jsonResponse,
  requireLegacyOwner,
  withApiErrorHandling,
} from "../../lib/server/api-auth";

export const GET: APIRoute = async ({ locals }) =>
  withApiErrorHandling("/api/state", async () => {
    requireLegacyOwner(locals);
    const db = getD1FromLocals(locals);
    const snapshot = await loadStateFromD1(db);
    return jsonResponse(snapshot, 200);
  });

export const PUT: APIRoute = async ({ request, locals }) =>
  withApiErrorHandling("/api/state", async () => {
    requireLegacyOwner(locals);
    const db = getD1FromLocals(locals);
    const body = (await request.json()) as {
      state?: unknown;
      baseVersion?: unknown;
    };
    const state = body?.state;
    if (!state || typeof state !== "object") {
      return jsonResponse({ error: "Payload inválido" }, 400);
    }

    const baseVersion =
      typeof body?.baseVersion === "number" ? body.baseVersion : undefined;
    const outcome = await saveStateToD1(
      db,
      undefined,
      state,
      baseVersion,
    );

    if (!outcome.ok) {
      // Another device saved since the client's baseVersion: report the current
      // server snapshot so the client can reconcile instead of overwriting it.
      return jsonResponse(
        {
          conflict: true,
          state: outcome.current.state,
          version: outcome.current.version,
          updatedAt: outcome.current.updatedAt,
        },
        409,
      );
    }

    return jsonResponse(
      {
        ok: true,
        version: outcome.version,
        updatedAt: outcome.updatedAt,
      },
      200,
    );
  });
