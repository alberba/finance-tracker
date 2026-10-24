import { and, eq, gt } from 'drizzle-orm'
import { Effect } from 'effect'
import { authProof } from '../../../db/schema'
import { hashAuthenticationToken } from '../../../db/repositories/authentication'
import { query, type Database, type DatabaseError } from '../../../db/database'

export const NEW_AUTHENTICATION_PURPOSE = 'local-pin-recovery'

export function issueAuthenticationProof(
  userId: string,
  sessionId: string,
): Effect.Effect<string, DatabaseError, Database> {
  return Effect.gen(function* () {
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`
    const tokenHash = yield* Effect.promise(() => hashAuthenticationToken(token))
    yield* query((db) =>
      db.insert(authProof).values({
        tokenHash,
        userId,
        sessionId,
        purpose: NEW_AUTHENTICATION_PURPOSE,
        expiresAt: new Date(Date.now() + 300000),
      }),
    )
    return token
  })
}

/** A one-use receipt from an actual OTP ceremony, bound to user, new session and purpose. */
export function consumeAuthenticationProof(
  token: string,
  userId: string,
  sessionId: string,
): Effect.Effect<boolean, DatabaseError, Database> {
  return Effect.gen(function* () {
    const tokenHash = yield* Effect.promise(() => hashAuthenticationToken(token))
    const consumed = yield* query((db) =>
      db
        .delete(authProof)
        .where(
          and(
            eq(authProof.tokenHash, tokenHash),
            eq(authProof.userId, userId),
            eq(authProof.sessionId, sessionId),
            eq(authProof.purpose, NEW_AUTHENTICATION_PURPOSE),
            gt(authProof.expiresAt, new Date()),
          ),
        )
        .returning({ userId: authProof.userId }),
    )
    return consumed.length === 1
  })
}
