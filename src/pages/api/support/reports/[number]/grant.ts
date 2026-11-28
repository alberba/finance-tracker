import type { APIRoute } from 'astro'
import { z } from 'zod'

import { getDb } from '../../../../../db/client'
import { changeGrant } from '../../../../../db/repositories/private-reports'
import {
  jsonResponse,
  requirePrincipal,
  withApiErrorHandling,
} from '../../../../../lib/server/api-auth'
import {
  ISSUE_NUMBER_PATTERN,
  parseNumericParam,
} from '../../../../../lib/server/issue-reports/route'
import { runServer } from '../../../../../lib/server/runtime'

const grantSchema = z.object({ supportUserId: z.uuid(), enabled: z.boolean() })

export const POST: APIRoute = async ({ params, request, locals }) =>
  withApiErrorHandling('/api/support/reports/[number]/grant', async () => {
    const principal = requirePrincipal(locals)
    const number = parseNumericParam(params.number, ISSUE_NUMBER_PATTERN)
    if (!principal.isAdmin || !number) return jsonResponse({ error: 'Caso no disponible.' }, 404)
    const input = grantSchema.safeParse(await request.json().catch(() => null))
    if (!input.success) return jsonResponse({ error: 'Permiso inválido.' }, 400)
    const { supportUserId, enabled } = input.data
    if (enabled && supportUserId === principal.userId) {
      return jsonResponse({ error: 'Otra persona administradora debe conceder el acceso.' }, 403)
    }
    const changed = await runServer(
      getDb(locals),
      changeGrant(number, principal.userId, supportUserId, enabled, new Date().toISOString()),
    )
    return changed
      ? jsonResponse({ ok: true }, 200)
      : jsonResponse({ error: 'Caso no disponible.' }, 404)
  })
