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

export const GET: APIRoute = async ({ locals }) =>
  withApiErrorHandling('/api/session', async () => {
    const principal = requirePrincipal(locals)
    const db = getDb(locals)
    const revisionRow = await syncRepository.getRevision(db, principal.userId)

    return jsonResponse(
      {
        user: {
          id: principal.userId,
          email: principal.email,
          isLegacyOwner: principal.isLegacyOwner,
          isAdmin: principal.isAdmin ?? false,
        },
        revision: revisionRow?.revision ?? 0,
        authentication: principal.provider === 'better-auth' ? 'better-auth' : 'cf-access',
      },
      200,
    )
  })
