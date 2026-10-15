/**
 * "Empezar de cero" — the explicit v2 action that provisions a brand-new
 * private space for the authenticated user: current year, EUR (or the
 * requested currency), basic categories, no accounts/transactions/budgets/
 * goals. Wraps `POST /api/state/initialize` (WP4), which is itself
 * idempotent — calling this twice never re-seeds or duplicates data.
 *
 * Called by the authenticated data store; demo mode rejects the request here.
 */

import { isDemoMode } from '../../scripts/demo-mode'

export interface InitializeResult {
  ok: boolean
  alreadyInitialized?: boolean
  error?: string
}

export async function initializeFreshState(currency?: string): Promise<InitializeResult> {
  if (isDemoMode()) {
    return { ok: false, error: 'El modo demo no crea ni modifica espacios en la base de datos.' }
  }
  try {
    const response = await fetch('/api/state/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currency ? { currency } : {}),
    })
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean
      alreadyInitialized?: boolean
      error?: string
    } | null

    if (!response.ok || !body?.ok) {
      return { ok: false, error: body?.error ?? `El servidor respondió ${response.status}` }
    }

    return { ok: true, alreadyInitialized: Boolean(body.alreadyInitialized) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Error de red' }
  }
}
