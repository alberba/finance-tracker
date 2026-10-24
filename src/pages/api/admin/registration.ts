import type { APIRoute } from 'astro'
import { z } from 'zod'
import { getDb } from '../../../db/client'
import {
  createInvitation,
  grantAdministrator,
  registrationAdministration,
  revokeInvitation,
  updateRegistrationPolicy,
} from '../../../db/repositories/authentication'
import {
  ForbiddenError,
  jsonResponse,
  requirePrincipal,
  withApiErrorHandling,
} from '../../../lib/server/api-auth'
import { runServer } from '../../../lib/server/runtime'

function administrator(locals: App.Locals) {
  const principal = requirePrincipal(locals)
  if (!principal.isAdmin) throw new ForbiddenError('Se requiere el rol de administrador.')
  return principal
}
export const GET: APIRoute = ({ locals }) =>
  withApiErrorHandling('/api/admin/registration', async () => {
    administrator(locals)
    return jsonResponse(await runServer(getDb(locals), registrationAdministration()), 200)
  })
const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    maxUses: z.number().int().min(1).max(10000).default(5),
    days: z.number().positive().max(365).default(7),
  }),
  z.object({ action: z.literal('revoke'), id: z.string().min(1) }),
  z.object({ action: z.literal('policy'), publicRegistration: z.boolean() }),
  z.object({ action: z.literal('grant-admin'), userId: z.string().min(1) }),
])
export const POST: APIRoute = ({ request, locals }) =>
  withApiErrorHandling('/api/admin/registration', async () => {
    const principal = administrator(locals)
    const parsed = actionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonResponse({ error: 'Datos de administración no válidos.' }, 400)
    const db = getDb(locals)
    const action = parsed.data
    if (action.action === 'create') {
      const invitation = await runServer(db, createInvitation(principal.userId, action.maxUses, action.days))
      return jsonResponse(
        {
          ...invitation,
          url: `${new URL(request.url).origin}/login?invitation=${invitation.token}`,
        },
        201,
      )
    }
    if (action.action === 'revoke') await runServer(db, revokeInvitation(action.id))
    if (action.action === 'policy') await runServer(db, updateRegistrationPolicy(action.publicRegistration))
    if (action.action === 'grant-admin') await runServer(db, grantAdministrator(action.userId))
    return jsonResponse({ success: true }, 200)
  })
