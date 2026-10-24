/**
 * Server execution point (ADR-0006).
 *
 * Astro endpoints, middleware and the login page run their effects here. It
 * provides the database handle of the request and the HTTP layer, and maps a
 * `DatabaseError` back to the driver error so route-level handling keeps its
 * behaviour. Nothing else in `src/pages` or `src/middleware.ts` executes an
 * effect directly.
 */

import { Effect } from 'effect'
import { Database, DatabaseError } from '../../db/database'
import type { Db } from '../../db/repositories/shared'
import { Http } from './http'

/** Runs an effect that only needs the HTTP layer (edge helper, same runtime). */
export const runHttp = <A, E>(
  effect: Effect.Effect<A, E, Http>,
  request: typeof fetch = fetch,
): Promise<A> => Effect.runPromise(Effect.provideService(effect, Http, { request }))

export async function runServer<A, E>(
  db: Db,
  effect: Effect.Effect<A, E, Database | Http>,
  request: typeof fetch = fetch,
): Promise<A> {
  try {
    return await Effect.runPromise(
      effect.pipe(Effect.provideService(Database, db), Effect.provideService(Http, { request })),
    )
  } catch (error) {
    throw error instanceof DatabaseError ? error.cause : error
  }
}
