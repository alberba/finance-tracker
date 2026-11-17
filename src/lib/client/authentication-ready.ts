/**
 * Startup marker kept apart from the Better Auth client.
 *
 * `AccessForm` needs to publish `data-finance-ready` on mount, but importing
 * that tiny helper from `authentication.ts` pulled the whole auth client
 * (better-auth + passkey, ~15 kB gzip) into the login page's first paint and
 * defeated the on-demand import used by the form actions.
 */
export function markAuthenticationReady(): void {
  document.documentElement.dataset.financeReady = 'true'
}
