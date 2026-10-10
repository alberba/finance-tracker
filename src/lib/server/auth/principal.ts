/**
 * `AuthPrincipal` type + first-auth provisioning (WP3).
 *
 * `Astro.locals.principal` is the *only* source of `user_id` on the server
 * (per the plan: "el cliente nunca envía user_id") — every downstream WP4
 * route reads `principal.userId`, never a query/body param.
 */

import { and, eq } from 'drizzle-orm'
import { users, userIdentities } from '../../../db/schema'
import { normalizeEmail, runInTransaction, type Db } from '../../../db/repositories/shared'
import { findLegacyOwnerToLink } from './legacy-owner-link'
import { initializeNewUser } from '../initialize-new-user'

/**
 * Anything `resolvePrincipal`/`findLegacyOwnerToLink` can run a query
 * against. Previously distinguished a real `Tx` handle from `Db`
 * (`db.transaction()`'s callback parameter) — collapsed to just `Db` when
 * this switched to `runInTransaction` (see its doc comment: real D1 rejects
 * `db.transaction()`'s raw `BEGIN` just like it rejects `shared.ts`'s own,
 * so both call sites now share the same best-effort wrapper, which passes
 * the same `db` through rather than a distinct transaction-scoped handle).
 */
export type Queryable = Db

export const CF_ACCESS_PROVIDER = 'cf-access'

/** Identity resolved from a verified Cf-Access JWT, attached to `Astro.locals`. */
export interface AuthPrincipal {
  userId: string
  email: string | null
  provider: string
  subject: string
  isLegacyOwner: boolean
  isAdmin?: boolean
}

export interface ResolvePrincipalInput {
  provider: string
  subject: string
  email?: string | null
  /** `LEGACY_OWNER_EMAIL` from `RuntimeEnv`, if configured. */
  legacyOwnerEmail?: string | null
}

async function findExistingPrincipal(
  db: Queryable,
  provider: string,
  subject: string,
): Promise<AuthPrincipal | null> {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      isLegacyOwner: users.isLegacyOwner,
    })
    .from(userIdentities)
    .innerJoin(users, eq(users.id, userIdentities.userId))
    .where(and(eq(userIdentities.provider, provider), eq(userIdentities.subject, subject)))
    .limit(1)

  const row = rows[0]
  if (!row) {
    return null
  }
  return {
    userId: row.userId,
    email: row.email,
    provider,
    subject,
    isLegacyOwner: row.isLegacyOwner === 1,
  }
}

/**
 * Resolves (or provisions) the `AuthPrincipal` for a verified `(provider,
 * subject)` pair.
 *
 * - Repeat logins: the `(provider, subject)` identity already exists — a
 *   single read, no writes, idempotent no-op.
 * - First login: creates `users` + `user_identities` transactionally,
 *   linking to the reserved legacy-owner row instead of provisioning a new
 *   user when the verified email matches `LEGACY_OWNER_EMAIL`
 *   (see `legacy-owner-link.ts`).
 */
export async function resolvePrincipal(
  db: Db,
  input: ResolvePrincipalInput,
): Promise<AuthPrincipal> {
  const existing = await findExistingPrincipal(db, input.provider, input.subject)
  if (existing) {
    return existing
  }

  return runInTransaction(db, async (tx) => {
    // Re-check inside the transaction: a concurrent request may have created
    // the identity between the read above and now.
    const existingInTx = await findExistingPrincipal(tx, input.provider, input.subject)
    if (existingInTx) {
      return existingInTx
    }

    const linked = await findLegacyOwnerToLink(tx, {
      email: input.email,
      legacyOwnerEmail: input.legacyOwnerEmail,
    })

    const now = new Date().toISOString()
    let userId: string
    let email: string | null
    let isLegacyOwner: boolean

    if (linked) {
      userId = linked.userId
      email = linked.email
      isLegacyOwner = true
    } else {
      const inserted = await tx
        .insert(users)
        .values({
          // Normalized so a later sign-in whose provider echoes a different
          // casing resolves to this same row instead of tripping the unique
          // index or minting a duplicate user.
          email: normalizeEmail(input.email ?? `${input.provider}:${input.subject}`),
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: users.id, email: users.email })
      userId = inserted[0].id
      email = inserted[0].email
      isLegacyOwner = false
      await initializeNewUser(tx, userId)
    }

    await tx.insert(userIdentities).values({
      userId,
      provider: input.provider,
      subject: input.subject,
      email: input.email ? normalizeEmail(input.email) : null,
      createdAt: now,
    })

    return { userId, email, provider: input.provider, subject: input.subject, isLegacyOwner }
  })
}
