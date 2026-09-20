/** Server-side error tracking for unhandled API route failures. */

import * as Sentry from "@sentry/cloudflare";

export interface ApiRouteFailure {
  /** Route pattern of the failing endpoint, for example `/api/issues/report`. */
  route: string;
  status: number;
}

/**
 * Privacy contract: to Sentry travel only the route pattern and the HTTP
 * status. Never request or response bodies, headers, credentials, `extra`,
 * `contexts` or financial data.
 */
export function reportApiRouteFailure(error: unknown, failure: ApiRouteFailure): void {
  Sentry.withScope((scope) => {
    scope.setTag("api.route", failure.route);
    scope.setTag("http.response.status_code", String(failure.status));
    Sentry.captureException(error);
  });
}
