/**
 * Better Auth's browser client and the small helpers around it.
 *
 * Deliberately free of Effect: the login page is the first thing an anonymous
 * visitor hydrates, so it imports only this module and loads the
 * Effect-backed `authenticationRequest` on demand for the recover-access form.
 */

import { createAuthClient } from 'better-auth/client'
import { emailOTPClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'

export const authentication = createAuthClient({ plugins: [emailOTPClient(), passkeyClient()] })

export function openFinanzas(): void {
  window.location.assign('/')
}

export async function requireAuthenticationResult(result: {
  error?: { message?: string } | null
}): Promise<void> {
  if (result.error) throw new Error(result.error.message ?? 'No se pudo completar el acceso.')
}

export function markAuthenticationReady(): void {
  document.documentElement.dataset.financeReady = 'true'
}
