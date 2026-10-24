/**
 * Client execution point (ADR-0006).
 *
 * Vue event handlers, Pinia actions and the startup scripts run their effects
 * here. This is the only place on the client that calls `Effect.runPromise`;
 * the modules under `src/lib/client` return `Effect<A, E, R>` and never a
 * `Promise` across their own boundary.
 *
 * One runtime per signed-in user owns the HTTP layer and the local storage
 * handles (cache + outbox) for the page's lifetime. It is assembled with
 * `Effect.provideService` instead of `ManagedRuntime` + `Layer` on purpose:
 * the client only ever needs these two services, and keeping the layer
 * machinery out of the bundle saves the startup budget (ADR-0006).
 */

import { Effect } from 'effect'

import { ClientHttp } from './http'
import { openIdbCache } from './idb-cache'
import { openOutbox } from './outbox'
import { ClientStorage } from './storage'

export type ClientRuntimeServices = ClientHttp | ClientStorage

export interface ClientRuntime {
  readonly run: <A, E>(effect: Effect.Effect<A, E, ClientRuntimeServices>) => Promise<A>
  readonly dispose: () => Promise<void>
}

export const createClientRuntime = async (
  userId: string,
  request: typeof fetch = fetch,
): Promise<ClientRuntime> => {
  const cache = await Effect.runPromise(openIdbCache(userId))
  let outbox: IDBDatabase
  try {
    outbox = await Effect.runPromise(openOutbox(userId))
  } catch (error) {
    cache.close()
    throw error
  }
  const storage = { cache, outbox }
  let disposed = false

  return {
    run: (effect) =>
      Effect.runPromise(
        effect.pipe(
          Effect.provideService(ClientStorage, storage),
          Effect.provideService(ClientHttp, { request }),
        ),
      ),
    dispose: async () => {
      if (disposed) return
      disposed = true
      cache.close()
      outbox.close()
    },
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
