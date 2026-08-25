const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const JSON_BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function hasJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

/** Rejects browser cross-site mutations before authentication or route code runs. */
export function rejectUnsafeApiMutation(request: Request): Response | null {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/") || !MUTATION_METHODS.has(request.method.toUpperCase())) {
    return null;
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") {
    return jsonError("Solicitud cross-site rechazada.", 403);
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) {
    return jsonError("Origen no permitido.", 403);
  }

  if (JSON_BODY_METHODS.has(request.method.toUpperCase()) && !hasJsonContentType(request)) {
    return jsonError("Content-Type application/json requerido.", 415);
  }

  return null;
}

export function isLocalTestRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function requiresAuthentication(request: Request): boolean {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    return true;
  }
  const accept = request.headers.get("accept") ?? "";
  const mode = request.headers.get("sec-fetch-mode") ?? "";
  return accept.includes("text/html") || mode === "navigate";
}
