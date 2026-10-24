/**
 * Effect-backed request to the app's authentication endpoints (recover access).
 *
 * Live in its own module so the login island does not drag Effect into its
 * first chunk: only the recover-access branch imports it, on demand.
 */

import { Data, Effect } from 'effect'

import { readJson, sendRequest, type ClientHttp } from './http'

export class AuthenticationRequestError extends Data.TaggedError('AuthenticationRequestError')<{
  readonly message: string
}> {}

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
