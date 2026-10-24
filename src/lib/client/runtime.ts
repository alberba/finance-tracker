/**
 * Client execution point (ADR-0006).
 *
 * Vue event handlers, Pinia actions and the startup scripts run their effects
 * here. This is the only place on the client that calls `Effect.runPromise`;
 * the modules under `src/lib/client` return `Effect<A, E, R>` and never a
 * `Promise` across their own boundary.
 *
 * The per-user runtime (HTTP + local storage) is assembled in this module as
 * well, so a page has one owner for the IndexedDB handles it opens.
 */

import { Effect } from 'effect'

import { ClientHttp, clientHttpLayer } from './http'

/**
 * Runs an effect that only needs the HTTP layer. Session lookups and the
 * wrappers in `src/services` use it: they run before (or without) an
 * authenticated per-user runtime.
 */
export const runClientHttp = <A, E>(
  effect: Effect.Effect<A, E, ClientHttp>,
  request: typeof fetch = fetch,
): Promise<A> => Effect.runPromise(Effect.provideService(effect, ClientHttp, { request }))

export { clientHttpLayer }
