import type { APIRoute } from "astro";
import { getD1FromLocals } from "../../lib/server/cloudflare-env";
import { loadStateFromD1, saveStateToD1 } from "../../lib/server/d1-state";

function requestNamespace(request: Request): string | undefined {
  const header = request.headers.get("x-finance-namespace");
  return header || undefined;
}

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const db = getD1FromLocals(locals);
    const state = await loadStateFromD1(db, requestNamespace(request));
    return new Response(JSON.stringify({ state }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo cargar el estado";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  try {
    const db = getD1FromLocals(locals);
    const body = (await request.json()) as { state?: unknown };
    const state = body?.state;
    if (!state || typeof state !== "object") {
      return new Response(JSON.stringify({ error: "Payload inválido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await saveStateToD1(db, requestNamespace(request), state);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "No se pudo guardar el estado" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
