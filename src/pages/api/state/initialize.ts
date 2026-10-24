/**
 * Ensures settings exist without adding category suggestions to existing users.
 * Authentication provisions new users before their first bootstrap. Repeated
 * initialization preserves settings and financial data.
 */

import type { APIRoute } from 'astro'
import { getDb } from '../../../db/client'
import * as accountsRepository from '../../../db/repositories/accounts'
import * as userSettingsRepository from '../../../db/repositories/user-settings'
import * as syncRepository from '../../../db/repositories/sync'
import { runInTransaction } from '../../../db/repositories/shared'
import { jsonResponse, requirePrincipal, withApiErrorHandling } from '../../../lib/server/api-auth'
import { runWithDb } from '../../../db/database'

export const POST: APIRoute = async ({ request, locals }) =>
  withApiErrorHandling('/api/state/initialize', async () => {
    const principal = requirePrincipal(locals)
    const db = getDb(locals)
    const userId = principal.userId

    let requestedCurrency: string | undefined
    try {
      const body = (await request.json()) as { currency?: unknown } | null
      if (body && typeof body.currency === 'string' && body.currency.trim()) {
        requestedCurrency = body.currency.trim().toUpperCase()
      }
    } catch {
      // Empty/absent body is fine — initialize takes no required fields.
    }

    const result = await runInTransaction(db, async (tx) => {
      const existingSettings = await runWithDb(tx, userSettingsRepository.get(userId))
      if (existingSettings) {
        await syncRepository.ensureRevision(tx, userId)
        return { alreadyInitialized: true, settings: existingSettings }
      }
      const settings = await runWithDb(tx, userSettingsRepository.create(userId, {
        currency: requestedCurrency ?? 'EUR',
      }))
      const categories = await accountsRepository.listCategoriesByUser(tx, userId)
      await syncRepository.ensureRevision(tx, userId)
      return { alreadyInitialized: false, settings, categories }
    })

    return jsonResponse({ ok: true, ...result }, result.alreadyInitialized ? 200 : 201)
  })
