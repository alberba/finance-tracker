export const DEMO_MODE_COOKIE = "finance-demo-mode";

const DEMO_VALUES = new Set(["1", "on", "true"]);

function hasEnabledDemoQuery(url: URL): boolean {
  return DEMO_VALUES.has((url.searchParams.get("demo") ?? "").toLowerCase());
}

function hasEnabledDemoCookie(request: Request): boolean {
  const cookies = request.headers.get("cookie") ?? "";
  return cookies.split(";").some((entry) => {
    const [name, ...valueParts] = entry.trim().split("=");
    return name === DEMO_MODE_COOKIE && valueParts.join("=") === "1";
  });
}

/**
 * Allows anonymous navigation only. API routes remain behind their normal
 * authentication boundary even if a caller forges the client-readable demo
 * cookie, so it cannot become a bypass for private data.
 */
export function isPublicDemoNavigation(request: Request): boolean {
  if (request.method !== "GET") return false;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return false;

  return url.pathname === "/demo" || hasEnabledDemoQuery(url) || hasEnabledDemoCookie(request);
}
