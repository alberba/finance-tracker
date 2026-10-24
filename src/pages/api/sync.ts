/**
 * `POST /api/sync` (WP4) — applies a batch of ≤5 client-submitted sync
 * commands. Each command is reserved for at-most-once application and its
 * update/delete is guarded by `baseVersion`; the batch halts fail-fast on the
 * first conflict. Repeated completed commands return their stored result.
 */

import type { APIRoute } from 'astro'
import { getDb } from '../../db/client'
import { applySyncBatch } from '../../lib/server/sync/apply-command'
import { syncBatchSchema } from '../../lib/server/sync/command-schemas'
import { jsonResponse, requirePrincipal, withApiErrorHandling } from '../../lib/server/api-auth'
import { runServer } from '../../lib/server/runtime'

export const POST: APIRoute = async ({ request, locals }) =>
  withApiErrorHandling('/api/sync', async () => {
    const principal = requirePrincipal(locals)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ error: 'Cuerpo JSON inválido.' }, 400)
    }

    const parsed = syncBatchSchema.safeParse(body)
    if (!parsed.success) {
      return jsonResponse({ error: 'Payload de sync inválido.', issues: parsed.error.issues }, 400)
    }

    const db = getDb(locals)
    const batchResult = await runServer(db, applySyncBatch(principal.userId, parsed.data.commands))

    const hasConflict = batchResult.results.some((result) => result.status === 'conflict')

    return jsonResponse(
      {
        results: batchResult.results,
        revision: batchResult.revision,
        halted: batchResult.halted,
      },
      hasConflict ? 409 : 200,
    )
  })
