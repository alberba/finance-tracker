/**
 * `POST /api/state/reset` (WP4) — new v2 semantics per the work-package
 * spec: it wipes the authenticated user's own private rows across every v2
 * table (per-user "empezar de cero") and re-seeds the
 * same defaults as `POST /api/state/initialize`.
 *
 * `integration_credentials` is deliberately left untouched (WP12 owns that
 * table's lifecycle; a reset should not silently revoke a configured
 * integration).
 */

import type { APIRoute } from 'astro'
import { getDb } from '../../../db/client'
import * as accountsRepository from '../../../db/repositories/accounts'
import * as userSettingsRepository from '../../../db/repositories/user-settings'
import * as syncRepository from '../../../db/repositories/sync'
import { jsonResponse, requirePrincipal, withApiErrorHandling } from '../../../lib/server/api-auth'
import { runInTransaction } from '../../../db/repositories/shared'
import { wipeUserData } from '../../../lib/server/wipe-user-data'
import { runServer } from '../../../lib/server/runtime'

const DEFAULT_CATEGORIES: Array<{ name: string; kind: string; sortOrder: number }> = [
  { name: 'Ingresos', kind: 'income', sortOrder: 0 },
  { name: 'Gastos generales', kind: 'expense', sortOrder: 0 },
]

export const POST: APIRoute = async ({ locals }) =>
  withApiErrorHandling('/api/state/reset', async () => {
    const principal = requirePrincipal(locals)
    const db = getDb(locals)
    const userId = principal.userId

    const result = await runInTransaction(db, async (tx) => {
      const previousSettings = await runServer(tx, userSettingsRepository.get(userId))
      await runServer(tx, wipeUserData(userId))
      const settings = await runServer(
        tx,
        userSettingsRepository.create(userId, {
          currency: 'EUR',
          onboardingPresented: previousSettings?.onboardingPresented === 1,
          onboardingDismissed: previousSettings?.onboardingDismissed === 1,
          onboardingAccountCompleted: previousSettings?.onboardingAccountCompleted === 1,
          onboardingMovementCompleted: previousSettings?.onboardingMovementCompleted === 1,
          onboardingCompleted: previousSettings?.onboardingCompleted === 1,
        }),
      )
      const categories = await runServer(
        tx,
        accountsRepository.bulkInsertCategories(userId, DEFAULT_CATEGORIES),
      )
      const { revision } = await runServer(tx, syncRepository.bumpRevision(userId))
      await runServer(
        tx,
        syncRepository.createChange(userId, {
          revision,
          entityType: 'reset',
          entityId: userId,
          changeType: 'update',
          payload: null,
        }),
      )
      return { settings, categories }
    })

    return jsonResponse({ ok: true, ...result }, 200)
  })
