import type { APIRoute } from "astro";
import { getD1FromLocals } from "../../../lib/server/cloudflare-env";
import { resetStateInD1 } from "../../../lib/server/d1-state";
import { getFinanceNamespace } from "../../../lib/server/state-request";

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const db = getD1FromLocals(locals);
    const snapshot = await resetStateInD1(db, getFinanceNamespace(request));
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
    const message =
      error instanceof Error ? error.message : "No se pudo reiniciar el estado";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
