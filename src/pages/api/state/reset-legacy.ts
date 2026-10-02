/** Temporary owner-only reset for the fixed default v1 blob during cutover. */

import type { APIRoute } from "astro";
import { getD1FromLocals } from "../../../lib/server/cloudflare-env";
import { resetStateInD1 } from "../../../lib/server/d1-state";
import {
  jsonResponse,
  requireLegacyOwner,
  withApiErrorHandling,
} from "../../../lib/server/api-auth";

export const POST: APIRoute = async ({ locals }) =>
  withApiErrorHandling("/api/state/reset-legacy", async () => {
    requireLegacyOwner(locals);
    const db = getD1FromLocals(locals);
    const snapshot = await resetStateInD1(db);
    return jsonResponse({ ok: true, ...snapshot }, 200);
  });
