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

    const existingSettings = await userSettingsRepository.get(db, userId)
    if (existingSettings) {
      await syncRepository.ensureRevision(db, userId)
      return jsonResponse({ ok: true, alreadyInitialized: true, settings: existingSettings }, 200)
    }

    const result = await runInTransaction(db, async (tx) => {
      const settings = await userSettingsRepository.create(tx, userId, {
        currency: requestedCurrency ?? 'EUR',
      })
      const existingCategories = await accountsRepository.listCategoriesByUser(tx, userId)
      const categories = existingCategories
      await syncRepository.ensureRevision(tx, userId)
      return { settings, categories }
    })

    return jsonResponse({ ok: true, alreadyInitialized: false, ...result }, 201)
  })
