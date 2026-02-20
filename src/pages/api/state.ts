import type { APIRoute } from "astro";
import { loadStateFromSqlite, saveStateToSqlite } from "../../lib/server/sqlite-state";

function requestNamespace(request: Request): string | undefined {
  const header = request.headers.get("x-finance-namespace");
  return header || undefined;
}

export const GET: APIRoute = async ({ request }) => {
  const state = loadStateFromSqlite(requestNamespace(request));
  return new Response(JSON.stringify({ state }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const PUT: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const state = body?.state;
    if (!state || typeof state !== "object") {
      return new Response(JSON.stringify({ error: "Payload inválido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    saveStateToSqlite(requestNamespace(request), state);
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
