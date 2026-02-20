import type { APIRoute } from "astro";
import { resetStateInSqlite } from "../../../lib/server/sqlite-state";

function requestNamespace(request: Request): string | undefined {
  const header = request.headers.get("x-finance-namespace");
  return header || undefined;
}

export const POST: APIRoute = async ({ request }) => {
  const state = resetStateInSqlite(requestNamespace(request));
  return new Response(JSON.stringify({ ok: true, state }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
