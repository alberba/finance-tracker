import type { APIRoute } from "astro";
import { ZodError } from "zod";
import { getRuntimeEnvFromLocals } from "../../../lib/server/cloudflare-env";
import { reportApiRouteFailure } from "../../../lib/server/error-tracking";
import { createIssueFromWebReport } from "../../../lib/server/github-issues";
import { parseIssueReportPayload } from "../../../lib/server/issue-report-schema";
import { requirePrincipal, withApiErrorHandling } from "../../../lib/server/api-auth";

type Bucket = {
  count: number;
  windowStart: number;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const buckets = new Map<string, Bucket>();

function now(): number {
  return Date.now();
}

function consumeRateLimit(key: string): boolean {
  const currentTime = now();
  const current = buckets.get(key);
  if (!current || currentTime - current.windowStart > RATE_LIMIT_WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: currentTime });
    return true;
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  current.count += 1;
  buckets.set(key, current);
  return true;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export const POST: APIRoute = async ({ request, locals }) =>
  withApiErrorHandling("/api/issues/report", async () => {
    const principal = requirePrincipal(locals);
    if (!consumeRateLimit(principal.userId)) {
      return jsonResponse(
        { ok: false, error: "Rate limit excedido. Intenta en un minuto." },
        429,
      );
    }

    try {
      const body = await request.json();
      const payload = parseIssueReportPayload(body);
      const env = getRuntimeEnvFromLocals(locals);
      const created = await createIssueFromWebReport(payload, env);
      return jsonResponse(
        {
          ok: true,
          issueNumber: created.number,
          issueUrl: created.url,
        },
        201,
      );
    } catch (error) {
      if (error instanceof ZodError) {
        return jsonResponse(
          { ok: false, error: "Payload inválido.", details: error.issues },
          400,
        );
      }
      console.error("[issues/report] Issue creation failed", error);
      // El catch resuelve la respuesta, así que `withApiErrorHandling` nunca ve
      // este fallo: se reporta acá, una sola vez y con la misma forma.
      reportApiRouteFailure(error, { route: "/api/issues/report", status: 500 });
      return jsonResponse({ ok: false, error: "No se pudo crear la issue" }, 500);
    }
  });
