/**
 * Adapter for the Bitvavo integration endpoints (ADR-0006).
 *
 * The import form and the movement-details panel both talk to
 * `/api/integrations/bitvavo`; the request shape and the error the UI shows
 * live here once, and each composable only runs the effect at its handler.
 */

import { Data, Effect } from 'effect'

import { readJson, sendRequest, type ClientHttp } from './http'

export class BitvavoRequestError extends Data.TaggedError('BitvavoRequestError')<{
  readonly message: string
}> {}

export const requestBitvavo = <T>(
  body?: object,
  method: 'GET' | 'POST' | 'PUT' = 'POST',
): Effect.Effect<T, BitvavoRequestError, ClientHttp> =>
  Effect.gen(function* () {
    const response = yield* sendRequest('/api/integrations/bitvavo', {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }).pipe(
      Effect.mapError(
        () => new BitvavoRequestError({ message: 'No se pudo conectar con el servidor.' }),
      ),
    )

    const result = (yield* readJson(response).pipe(
      Effect.orElseSucceed(() => null),
    )) as { error?: string } | null

    if (!response.ok) {
      return yield* Effect.fail(
        new BitvavoRequestError({
          message: result?.error || 'No se pudo completar la operación con Bitvavo.',
        }),
      )
    }

    return result as T
  })
