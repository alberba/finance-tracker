/**
 * `GET /api/changes?since&cursor` (WP4) — pure read, never writes. Walks
 * `sync_changes` for every change with `revision > since`, for the
 * authenticated user only. `cursor` is accepted as an alias for `since`
 * (both name the same revision cursor) so a client that persisted its
 * cursor under either name works without translation.
 */

import type { APIRoute } from "astro";
import { getDb } from "../../db/client";
import * as syncRepository from "../../db/repositories/sync";
import { jsonResponse, requirePrincipal, withApiErrorHandling } from "../../lib/server/api-auth";
import { runServer } from '../../lib/server/runtime'

function parseSince(url: URL): number | "invalid" {
  const raw = url.searchParams.get("since") ?? url.searchParams.get("cursor") ?? "0";
  const since = Number(raw);
  if (!Number.isFinite(since) || since < 0) {
    return "invalid";
  }
  return since;
}

export const GET: APIRoute = async ({ request, locals }) =>
  withApiErrorHandling("/api/changes", async () => {
    const principal = requirePrincipal(locals);
    const url = new URL(request.url);
    const since = parseSince(url);
    if (since === "invalid") {
      return jsonResponse({ error: "Parámetro 'since'/'cursor' inválido." }, 400);
    }

    const db = getDb(locals);
    const [changes, revisionRow] = await Promise.all([
      runServer(db, syncRepository.listChangesSince(principal.userId, since)),
      runServer(db, syncRepository.getRevision(principal.userId)),
    ]);

    return jsonResponse(
      {
        since,
        revision: revisionRow?.revision ?? 0,
        changes,
      },
      200,
    );
  });
