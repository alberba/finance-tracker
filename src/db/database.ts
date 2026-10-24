/**
 * Effect view of the relational database (ADR-0006).
 *
 * Repositories migrate one by one from `(db, ...) => Promise` to
 * `Effect<A, DatabaseError, Database>`. `runWithDb` is the transitional edge for
 * callers that are not Effect yet; it disappears as the server phases move the
 * execution point up to endpoints and middleware.
 */

import { Context, Data, Effect, Exit } from 'effect'
import { runInTransaction, type Db } from './repositories/shared'

export class DatabaseError extends Data.TaggedError('DatabaseError')<{ cause: unknown }> {}

export class Database extends Context.Service<Database, Db>()('finance/db/Database') {}

/** Runs one driver call against the current `Database`, typing any failure as `DatabaseError`. */
export const query = <A>(run: (db: Db) => Promise<A>): Effect.Effect<A, DatabaseError, Database> =>
  Effect.gen(function* () {
    const db = yield* Database
    return yield* Effect.tryPromise({
      try: () => run(db),
      catch: (cause) => new DatabaseError({ cause }),
    })
  })

/** Exposes a Promise-based repository function (first parameter `db`) as an Effect over `Database`. */
export const lift =
  <Args extends unknown[], A>(fn: (db: Db, ...args: Args) => Promise<A>) =>
  (...args: Args): Effect.Effect<A, DatabaseError, Database> =>
    query((db) => fn(db, ...args))

/**
 * Runs an effect inside one database transaction over the current `Database`.
 *
 * The driver-level transaction is opened by `runInTransaction` (native SQLite)
 * or skipped where the driver owns it (D1), so this keeps the exact behaviour
 * the Promise-based callers had while letting the body stay in Effect.
 */
export const transaction = <A, E>(
  effect: Effect.Effect<A, E, Database>,
): Effect.Effect<A, E | DatabaseError, Database> =>
  Effect.gen(function* () {
    const db = yield* Database
    const exit = yield* Effect.promise(async () => {
      try {
        return await runInTransaction(db, async (tx) => {
          const result = await Effect.runPromise(
            Effect.exit(Effect.provideService(effect, Database, tx)),
          )
          // Throwing hands the failure back to the driver so it rolls back.
          if (Exit.isFailure(result)) throw result
          return result
        })
      } catch (thrown) {
        if (Exit.isExit(thrown)) return thrown as Exit.Exit<A, E>
        throw thrown
      }
    })
    return yield* Exit.match(exit, {
      onSuccess: (value) => Effect.succeed(value),
      onFailure: (cause) => Effect.failCause(cause),
    })
  })

/**
 * Transitional edge: runs a repository effect against `db` from Promise-based code.
 * Rejects with the driver's original error so legacy callers keep their behaviour.
 */
export async function runWithDb<A>(
  db: Db,
  effect: Effect.Effect<A, DatabaseError, Database>,
): Promise<A> {
  try {
    return await Effect.runPromise(Effect.provideService(effect, Database, db))
  } catch (error) {
    throw error instanceof DatabaseError ? error.cause : error
  }
}
