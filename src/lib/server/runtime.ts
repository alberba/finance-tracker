/**
 * Transitional server runner (ADR-0006): executes an effect at the framework
 * edge with the database and HTTP layers it needs. Phase 4 replaces this with
 * one `ManagedRuntime` per request.
 */

import { Effect } from 'effect'
import { Database, DatabaseError } from '../../db/database'
import type { Db } from '../../db/repositories/shared'
import { Http } from './http'

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
