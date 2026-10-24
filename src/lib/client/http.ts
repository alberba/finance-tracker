/**
 * Outbound HTTP of the client as a service (ADR-0006).
 *
 * Every client module that talks to `/api/**` receives the request function
 * through this service instead of importing `fetch` or taking a `fetchImpl`
 * parameter, so tests provide a fake layer and the client runtime owns the real
 * one. The two failures a browser request can have before the response exists
 * are typed here: no network, and a body that is not JSON.
 */

import { Context, Data, Effect, Layer } from 'effect'

/** The request never produced a response (`fetch` rejected). */
export class ClientNetworkError extends Data.TaggedError('ClientNetworkError')<{
  readonly cause: unknown
}> {}

/** The response arrived, but its body is not parseable JSON. */
export class ClientJsonError extends Data.TaggedError('ClientJsonError')<{
  readonly cause: unknown
}> {}

export class ClientHttp extends Context.Service<ClientHttp, { readonly request: typeof fetch }>()(
  'finance/client/ClientHttp',
) {}

export const clientHttpLayer = (request: typeof fetch = fetch): Layer.Layer<ClientHttp> =>
  Layer.succeed(ClientHttp, { request })

export const sendRequest = (
  input: string,
  init?: RequestInit,
): Effect.Effect<Response, ClientNetworkError, ClientHttp> =>
  Effect.gen(function* () {
    const http = yield* ClientHttp
    return yield* Effect.tryPromise({
      try: () => http.request(input, init),
      catch: (cause) => new ClientNetworkError({ cause }),
    })
  })

/** Reads the response body as JSON, typed so a caller can classify it by itself. */
export const readJson = (
  response: Response,
): Effect.Effect<unknown, ClientJsonError> =>
  Effect.tryPromise({
    try: () => response.json() as Promise<unknown>,
    catch: (cause) => new ClientJsonError({ cause }),
  })
