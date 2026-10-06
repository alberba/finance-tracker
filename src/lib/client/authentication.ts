import { createAuthClient } from 'better-auth/client'
import { emailOTPClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'

export const authentication = createAuthClient({ plugins: [emailOTPClient(), passkeyClient()] })
export function openFinanzas(): void {
  window.location.assign('/')
}
export async function authenticationRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    path,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  )
  const result = await response.json()
  if (!response.ok)
    throw new Error(result.error ?? result.message ?? 'No se pudo completar la acción.')
  return result as T
}
export async function requireAuthenticationResult(result: {
  error?: { message?: string } | null
}): Promise<void> {
  if (result.error) throw new Error(result.error.message ?? 'No se pudo completar el acceso.')
}

export function markAuthenticationReady(): void {
  document.documentElement.dataset.financeReady = 'true'
}
