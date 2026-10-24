/**
 * The session lookup the shell and the startup script share.
 *
 * Both run before the per-user runtime exists, so the adapter only needs the
 * HTTP layer. The shape is the subset of `/api/session` they consume.
 */

import { Data, Effect } from 'effect'

import { readJson, sendRequest, type ClientHttp } from './http'

export interface ClientSession {
  user?: { id?: string; email?: string; isAdmin?: boolean }
  authentication?: string
}

export class SessionLookupError extends Data.TaggedError('SessionLookupError')<{
  readonly message: string
}> {}

export const fetchSession = (): Effect.Effect<ClientSession, SessionLookupError, ClientHttp> =>
  Effect.gen(function* () {
    const response = yield* sendRequest('/api/session').pipe(
      Effect.mapError(
        () => new SessionLookupError({ message: 'No se pudo resolver la sesión.' }),
      ),
    )
    if (!response.ok) {
      return yield* Effect.fail(
        new SessionLookupError({
          message: `No se pudo resolver la sesión (${response.status}).`,
        }),
      )
    }
    const body = (yield* readJson(response).pipe(
      Effect.orElseSucceed(() => null),
    )) as ClientSession | null
    if (!body) {
      return yield* Effect.fail(
        new SessionLookupError({ message: 'La sesión devolvió una respuesta inválida.' }),
      )
    }
    return body
  })
