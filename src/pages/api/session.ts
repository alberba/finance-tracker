/**
 * `GET /api/session` (WP4) — pure read, never writes. Returns the
 * authenticated principal plus the user's current sync revision cursor, so
 * a client can decide whether it needs to bootstrap or can resume from its
 * last known revision.
 */

import type { APIRoute } from 'astro'
import { getDb } from '../../db/client'
import * as syncRepository from '../../db/repositories/sync'
import { jsonResponse, requirePrincipal, withApiErrorHandling } from '../../lib/server/api-auth'
import { runServer } from '../../lib/server/runtime'

export const GET: APIRoute = async ({ locals }) =>
  withApiErrorHandling('/api/session', async () => {
    const principal = requirePrincipal(locals)
    const db = getDb(locals)
    const revisionRow = await runServer(db, syncRepository.getRevision(principal.userId))

    return jsonResponse(
      {
        user: {
          id: principal.userId,
          email: principal.email,
          isAdmin: principal.isAdmin ?? false,
        },
        revision: revisionRow?.revision ?? 0,
        authentication: 'better-auth',
      },
      200,
    )
  })
