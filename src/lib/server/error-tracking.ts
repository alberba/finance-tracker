/** Server-side error tracking for unhandled API route failures. */

import * as Sentry from "@sentry/cloudflare";

export interface ApiRouteFailure {
  /** Route pattern of the failing endpoint, for example `/api/issues/report`. */
  route: string;
  status: number;
}

/**
 * Privacy contract: to Sentry travel the two tags we set (`api.route` and
 * `http.response.status_code`) plus the exception itself, whose type, message
 * and stack are what make a server failure diagnosable. Never request or
 * response bodies, headers, credentials, `extra`, `contexts` or financial data.
 *
 * The rule that keeps that promise true: an `Error` message on this path must
 * not echo an upstream request or response body. `createIssueFromWebReport` in
 * `github-issues.ts` is the example to follow: its message names the GitHub
 * status only, while the upstream body is logged server-side with
 * `console.error` (the server SDK drops the `Console` integration, so that
 * breadcrumb never reaches Sentry).
 */
export function reportApiRouteFailure(error: unknown, failure: ApiRouteFailure): void {
  try {
    Sentry.withScope((scope) => {
      scope.setTag("api.route", failure.route);
      scope.setTag("http.response.status_code", String(failure.status));
      Sentry.captureException(error);
    });
  } catch {
    // El reporte es best-effort: la respuesta HTTP no puede fallar porque la
    // telemetría falló. Por eso no se relanza, y el fallo queda en un log fijo
    // que no incluye el error (evita arrastrar datos del evento). El SDK del
    // servidor no adjunta la integración `Console`, así que este log no vuelve
    // a entrar a Sentry.
    console.error(`[api] No se pudo reportar a Sentry el fallo de ${failure.route}.`);
  }
}
