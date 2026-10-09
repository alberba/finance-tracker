import { and, eq, gt } from 'drizzle-orm'
import type { Db } from '../../../db/client'
import { authProof } from '../../../db/schema'
import { hashAuthenticationToken } from '../../../db/repositories/authentication'

export const NEW_AUTHENTICATION_PURPOSE = 'local-pin-recovery'

export async function issueAuthenticationProof(db: Db, userId: string, sessionId: string) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`
  await db
    .insert(authProof)
    .values({
      tokenHash: await hashAuthenticationToken(token),
      userId,
      sessionId,
      purpose: NEW_AUTHENTICATION_PURPOSE,
      expiresAt: new Date(Date.now() + 300000),
    })
  return token
}

/** A one-use receipt from an actual OTP ceremony, bound to user, new session and purpose. */
export async function consumeAuthenticationProof(
  db: Db,
  token: string,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const consumed = await db
    .delete(authProof)
    .where(
      and(
        eq(authProof.tokenHash, await hashAuthenticationToken(token)),
        eq(authProof.userId, userId),
        eq(authProof.sessionId, sessionId),
        eq(authProof.purpose, NEW_AUTHENTICATION_PURPOSE),
        gt(authProof.expiresAt, new Date()),
      ),
    )
    .returning({ userId: authProof.userId })
  return consumed.length === 1
}
