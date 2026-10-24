/**
 * Outbound HTTP as a service (ADR-0006).
 *
 * Every server provider (Bitvavo, Stock Events, market data, GitHub issues)
 * receives the request function through this service instead of importing
 * `fetch` or taking a `fetchImpl` parameter, so tests inject a fake layer and
 * the endpoint runtime owns the real one.
 */

import { Context, Effect, Layer } from 'effect'

export class Http extends Context.Service<Http, { readonly request: typeof fetch }>()(
  'finance/http/Http',
) {}

export const httpLayer = (request: typeof fetch = fetch): Layer.Layer<Http> =>
  Layer.succeed(Http, { request })

/**
 * Transitional edge for callers that are not Effect yet (API routes until
 * phase 4 moves execution to the runtime). Disappears with `runWithDb`.
 */
export const runHttp = <A, E>(
  effect: Effect.Effect<A, E, Http>,
  request: typeof fetch = fetch,
): Promise<A> => Effect.runPromise(Effect.provideService(effect, Http, { request }))
