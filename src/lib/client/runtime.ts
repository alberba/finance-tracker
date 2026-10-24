/**
 * Client execution point (ADR-0006).
 *
 * Vue event handlers, Pinia actions and the startup scripts run their effects
 * here. This is the only place on the client that calls `Effect.runPromise`;
 * the modules under `src/lib/client` return `Effect<A, E, R>` and never a
 * `Promise` across their own boundary.
 *
 * One `ManagedRuntime` per signed-in user owns the HTTP layer and the local
 * storage handles (cache + outbox) for the page's lifetime. Logout disposes
 * it, so both IndexedDB connections close with the runtime.
 */

import { Effect, Layer, ManagedRuntime } from 'effect'

import { ClientHttp, clientHttpLayer } from './http'
import { openIdbCache } from './idb-cache'
import { openOutbox } from './outbox'
import { ClientStorage } from './storage'

export type ClientRuntimeServices = ClientHttp | ClientStorage

const storageLayer = (userId: string) =>
  Layer.effect(
    ClientStorage,
    Effect.gen(function* () {
      const cache = yield* Effect.acquireRelease(openIdbCache(userId), (db) =>
        Effect.sync(() => db.close()),
      )
      const outbox = yield* Effect.acquireRelease(openOutbox(userId), (db) =>
        Effect.sync(() => db.close()),
      )
      return { cache, outbox }
    }),
  )

export const clientLayer = (userId: string, request: typeof fetch = fetch) =>
  Layer.mergeAll(clientHttpLayer(request), storageLayer(userId))

export interface ClientRuntime {
  readonly run: <A, E>(effect: Effect.Effect<A, E, ClientRuntimeServices>) => Promise<A>
  readonly dispose: () => Promise<void>
}

export const createClientRuntime = (
  userId: string,
  request: typeof fetch = fetch,
): ClientRuntime => {
  const runtime = ManagedRuntime.make(clientLayer(userId, request))
  return {
    run: (effect) => runtime.runPromise(effect),
    dispose: () => runtime.dispose(),
  }
}

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
