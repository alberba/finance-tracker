/**
 * `POST /api/state/initialize` (WP4) — "empezar de cero": the only path
 * that provisions a brand-new private space for the authenticated user
 * (per WP8's design decision, wired here since WP8 hasn't landed yet).
 * Idempotent: if the user already has `user_settings`, this is a no-op
 * that just reports the current state rather than re-seeding.
 */

import type { APIRoute } from 'astro'
import { getDb } from '../../../db/client'
import * as accountsRepository from '../../../db/repositories/accounts'
import * as userSettingsRepository from '../../../db/repositories/user-settings'
import * as syncRepository from '../../../db/repositories/sync'
import { runInTransaction } from '../../../db/repositories/shared'
import { jsonResponse, requirePrincipal, withApiErrorHandling } from '../../../lib/server/api-auth'

const DEFAULT_CATEGORIES: Array<{ name: string; kind: string; sortOrder: number }> = [
  { name: 'Ingresos', kind: 'income', sortOrder: 0 },
  { name: 'Gastos generales', kind: 'expense', sortOrder: 0 },
]

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
      const existingSettings = await userSettingsRepository.get(tx, userId)
      if (existingSettings) {
        await syncRepository.ensureRevision(tx, userId)
        return { alreadyInitialized: true, settings: existingSettings }
      }
      const settings = await userSettingsRepository.create(tx, userId, {
        currency: requestedCurrency ?? 'EUR',
      })
      const existingCategories = await accountsRepository.listCategoriesByUser(tx, userId)
      const categories =
        existingCategories.length > 0
          ? existingCategories
          : await accountsRepository.bulkInsertCategories(tx, userId, DEFAULT_CATEGORIES)
      await syncRepository.ensureRevision(tx, userId)
      return { alreadyInitialized: false, settings, categories }
    })

    return jsonResponse({ ok: true, ...result }, result.alreadyInitialized ? 200 : 201)
  })
