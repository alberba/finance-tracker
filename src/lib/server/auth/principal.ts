/** The financial identity attached to an authenticated request. */

import { and, eq } from 'drizzle-orm'
import { users, userIdentities } from '../../../db/schema'
import { normalizeEmail, runInTransaction, type Db } from '../../../db/repositories/shared'
import { initializeNewUser } from '../initialize-new-user'

/** Query handle whose local connection ownership is retained across async calls. */
export type Queryable = Db

export interface AuthPrincipal {
  userId: string
  email: string | null
  /** Nombre de la cuenta (`auth_user.name`). Ausente en identidades de prueba. */
  name?: string | null
  provider: string
  subject: string
  isAdmin?: boolean
}

export interface ResolvePrincipalInput {
  provider: string
  subject: string
  email?: string | null
}

async function findExistingPrincipal(
  db: Queryable,
  provider: string,
  subject: string,
): Promise<AuthPrincipal | null> {
  const rows = await db
    .select({ userId: users.id, email: users.email })
    .from(userIdentities)
    .innerJoin(users, eq(users.id, userIdentities.userId))
    .where(and(eq(userIdentities.provider, provider), eq(userIdentities.subject, subject)))
    .limit(1)

  const row = rows[0]
  return row ? { userId: row.userId, email: row.email, provider, subject } : null
}

/**
 * Resolves or creates the isolated identity used by the loopback test shim.
 * Email is profile data only: it never links this identity to another user.
 */
export async function resolvePrincipal(
  db: Db,
  input: ResolvePrincipalInput,
): Promise<AuthPrincipal> {
  const existing = await findExistingPrincipal(db, input.provider, input.subject)
  if (existing) return existing

  return runInTransaction(db, async (tx) => {
    const existingInTx = await findExistingPrincipal(tx, input.provider, input.subject)
    if (existingInTx) return existingInTx

    const now = new Date().toISOString()
    const [user] = await tx
      .insert(users)
      .values({
        email: normalizeEmail(input.email ?? `${input.provider}:${input.subject}`),
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: users.id, email: users.email })

    // Eager provisioning for the welcome tour (#296): a fresh user gets
    // user_settings + the default categories + revision cursor now, so
    // setup-requirement checks work before the first bootstrap.
    // Idempotent: no-op when settings already exist.
    await initializeNewUser(tx, user.id)

    await tx.insert(userIdentities).values({
      userId: user.id,
      provider: input.provider,
      subject: input.subject,
      email: input.email ? normalizeEmail(input.email) : null,
      createdAt: now,
    })

    return { userId: user.id, email: user.email, provider: input.provider, subject: input.subject }
  })
}
