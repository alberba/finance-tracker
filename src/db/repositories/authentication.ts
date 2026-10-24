import { and, eq } from 'drizzle-orm'
import { lift } from '../database'
import { authAdmission, authInvitation, authPolicy, authRole, authUser, users } from '../schema'
import type { AuthPrincipal } from '../../lib/server/auth/principal'
import { initializeNewUser } from '../../lib/server/initialize-new-user'
import { runInTransaction, type Db } from './shared'

export async function hashAuthenticationToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function registrationInvitationSql(db: Db, token?: string): Promise<string | null> {
  if (token) {
    const [invitation] = await db
      .select()
      .from(authInvitation)
      .where(eq(authInvitation.tokenHash, await hashAuthenticationToken(token)))
      .limit(1)
    if (
      !invitation ||
      invitation.revoked ||
      invitation.expiresAt <= new Date() ||
      invitation.uses >= invitation.maxUses
    ) {
      throw new Error('Invitación caducada, revocada o sin plazas disponibles.')
    }
    return invitation.id
  }
  const [policy] = await db.select().from(authPolicy).where(eq(authPolicy.id, 'registration'))
  if (!policy?.publicRegistration) throw new Error('Necesitas una invitación para registrarte.')
  return null
}

/** The migration trigger commits admission, financial identity and place consumption in one statement. */
async function admitVerifiedUserSql(db: Db, id: string): Promise<void> {
  await runInTransaction(db, async (tx) => {
    const [existing] = await tx
      .select()
      .from(authAdmission)
      .where(eq(authAdmission.userId, id))
      .limit(1)
    if (existing) return
    const [user] = await tx.select().from(authUser).where(eq(authUser.id, id)).limit(1)
    if (!user?.emailVerified) throw new Error('Verifica tu correo antes de acceder.')
    const [financialUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
    await tx
      .insert(authAdmission)
      .values({ userId: id, invitationId: user.invitationId, createdAt: new Date() })
      .onConflictDoNothing()
    if (!financialUser) await initializeNewUser(tx, id)
  })
}

async function authenticatedPrincipalSql(db: Db, id: string): Promise<AuthPrincipal | null> {
  const [row] = await db
    .select({ id: users.id, email: users.email, name: authUser.name })
    .from(authAdmission)
    .innerJoin(users, eq(users.id, authAdmission.userId))
    .innerJoin(authUser, eq(authUser.id, users.id))
    .where(and(eq(authAdmission.userId, id), eq(authUser.emailVerified, true)))
    .limit(1)
  if (!row) return null
  const [role] = await db.select().from(authRole).where(eq(authRole.userId, id)).limit(1)
  return {
    userId: row.id,
    email: row.email,
    name: row.name,
    provider: 'better-auth',
    subject: row.id,
    isAdmin: role?.role === 'admin',
  }
}

async function createInvitationSql(db: Db, userId: string, maxUses = 5, days = 7) {
  if (
    !Number.isInteger(maxUses) ||
    maxUses < 1 ||
    maxUses > 10000 ||
    !Number.isFinite(days) ||
    days <= 0 ||
    days > 365
  ) {
    throw new Error('El cupo debe ser de 1 a 10000 y la duración de hasta 365 días.')
  }
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`
  const id = crypto.randomUUID()
  await db.insert(authInvitation).values({
    id,
    tokenHash: await hashAuthenticationToken(token),
    maxUses,
    uses: 0,
    expiresAt: new Date(Date.now() + days * 86400000),
    revoked: false,
    createdBy: userId,
    createdAt: new Date(),
  })
  return { id, token }
}

async function registrationAdministrationSql(db: Db) {
  const [policy] = await db.select().from(authPolicy).where(eq(authPolicy.id, 'registration'))
  const invitations = await db
    .select({
      id: authInvitation.id,
      maxUses: authInvitation.maxUses,
      uses: authInvitation.uses,
      expiresAt: authInvitation.expiresAt,
      revoked: authInvitation.revoked,
    })
    .from(authInvitation)
  return { publicRegistration: policy?.publicRegistration ?? false, invitations }
}

async function updateRegistrationPolicySql(db: Db, publicRegistration: boolean) {
  await db.update(authPolicy).set({ publicRegistration }).where(eq(authPolicy.id, 'registration'))
}
async function revokeInvitationSql(db: Db, id: string) {
  await db.update(authInvitation).set({ revoked: true }).where(eq(authInvitation.id, id))
}
async function grantAdministratorSql(db: Db, userId: string) {
  const principal = await authenticatedPrincipalSql(db, userId)
  if (!principal) throw new Error('El usuario debe haber completado su registro.')
  await db.insert(authRole).values({ userId, role: 'admin' }).onConflictDoNothing()
}

async function assertNewFinancialEmailSql(db: Db, email: string): Promise<void> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1)
  if (existing)
    throw new Error(
      'Hay datos existentes para este correo. Completa la migración de tu identidad antes de registrarte.',
    )
}

export const registrationInvitation = lift(registrationInvitationSql)
export const admitVerifiedUser = lift(admitVerifiedUserSql)
export const authenticatedPrincipal = lift(authenticatedPrincipalSql)
export const createInvitation = lift(createInvitationSql)
export const registrationAdministration = lift(registrationAdministrationSql)
export const updateRegistrationPolicy = lift(updateRegistrationPolicySql)
export const revokeInvitation = lift(revokeInvitationSql)
export const grantAdministrator = lift(grantAdministratorSql)
export const assertNewFinancialEmail = lift(assertNewFinancialEmailSql)
