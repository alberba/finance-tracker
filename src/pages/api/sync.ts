/**
 * `POST /api/sync` (WP4) — applies a batch of ≤5 client-submitted sync
 * commands. Each command runs in its own D1 transaction; the batch halts
 * fail-fast on the first version conflict (409-equivalent per-command
 * status); a repeated `commandId` returns its previously stored result
 * instead of re-applying the mutation (idempotent replay).
 */

import type { APIRoute } from "astro";
import { getDb } from "../../db/client";
import { applySyncBatch } from "../../lib/server/sync/apply-command";
import { syncBatchSchema } from "../../lib/server/sync/command-schemas";
import { jsonResponse, requirePrincipal, withApiErrorHandling } from "../../lib/server/api-auth";

export const POST: APIRoute = async ({ request, locals }) =>
  withApiErrorHandling(async () => {
    const principal = requirePrincipal(locals);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Cuerpo JSON inválido." }, 400);
    }

    const parsed = syncBatchSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse({ error: "Payload de sync inválido.", issues: parsed.error.issues }, 400);
    }

    const db = getDb(locals);
    const batchResult = await applySyncBatch(db, principal.userId, parsed.data.commands);

    const hasConflict = batchResult.results.some((result) => result.status === "conflict");

    return jsonResponse(
      {
        results: batchResult.results,
        revision: batchResult.revision,
        halted: batchResult.halted,
      },
      hasConflict ? 409 : 200,
    );
  });
