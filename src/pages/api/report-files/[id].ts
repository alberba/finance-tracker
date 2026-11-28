import type { APIRoute } from 'astro'
import { z } from 'zod'

import { getDb } from '../../../db/client'
import { readFile } from '../../../db/repositories/private-reports'
import { jsonResponse, requirePrincipal, withApiErrorHandling } from '../../../lib/server/api-auth'
import { runServer } from '../../../lib/server/runtime'

export const GET: APIRoute = async ({ params, locals }) =>
  withApiErrorHandling('/api/report-files/[id]', async () => {
    const principal = requirePrincipal(locals)
    if (!z.uuid().safeParse(params.id).success || !params.id) {
      return jsonResponse({ error: 'Adjunto no disponible.' }, 404)
    }
    const file = await runServer(
      getDb(locals),
      readFile(params.id, principal.userId, principal.isAdmin === true, new Date().toISOString()),
    )
    if (!file) return jsonResponse({ error: 'Adjunto no disponible.' }, 404)
    return new Response(file.bytes, {
      headers: {
        'Content-Type': file.contentType,
        'Cache-Control': 'private, no-store',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })
