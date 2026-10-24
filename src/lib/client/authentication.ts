import { createAuthClient } from 'better-auth/client'
import { emailOTPClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'
import { Data, Effect } from 'effect'

import { readJson, sendRequest, type ClientHttp } from './http'

export const authentication = createAuthClient({ plugins: [emailOTPClient(), passkeyClient()] })

export class AuthenticationRequestError extends Data.TaggedError('AuthenticationRequestError')<{
  readonly message: string
}> {}

export function openFinanzas(): void {
  window.location.assign('/')
}

export const authenticationRequest = <T>(
  path: string,
  body?: unknown,
): Effect.Effect<T, AuthenticationRequestError, ClientHttp> =>
  Effect.gen(function* () {
    const response = yield* sendRequest(
      path,
      body === undefined
        ? undefined
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
    ).pipe(
      Effect.mapError(
        (cause) =>
          new AuthenticationRequestError({
            message:
              cause.cause instanceof Error
                ? cause.cause.message
                : 'No se pudo completar la acción.',
          }),
      ),
    )

    const result = (yield* readJson(response).pipe(
      Effect.orElseSucceed(() => ({}) as Record<string, unknown>),
    )) as Record<string, unknown>

    if (!response.ok) {
      const message = result.error ?? result.message
      return yield* Effect.fail(
        new AuthenticationRequestError({
          message: typeof message === 'string' ? message : 'No se pudo completar la acción.',
        }),
      )
    }
    return result as T
  })

export async function requireAuthenticationResult(result: {
  error?: { message?: string } | null
}): Promise<void> {
  if (result.error) throw new Error(result.error.message ?? 'No se pudo completar el acceso.')
}

export function markAuthenticationReady(): void {
  document.documentElement.dataset.financeReady = 'true'
}
