/**
 * "Empezar de cero" — the explicit v2 action that provisions a brand-new
 * private space for the authenticated user: current year, EUR (or the
 * requested currency), basic categories, no accounts/transactions/budgets/
 * goals. Wraps `POST /api/state/initialize` (WP4), which is itself
 * idempotent — calling this twice never re-seeds or duplicates data.
 *
 * Called by the authenticated data store; demo mode rejects the request here.
 */

import { Effect } from 'effect'

import { isDemoMode } from '../../scripts/demo-mode'
import { readJson, sendRequest, type ClientHttp } from './http'

export interface InitializeResult {
  ok: boolean
  alreadyInitialized?: boolean
  error?: string
}

export const initializeFreshState = (
  currency?: string,
): Effect.Effect<InitializeResult, never, ClientHttp> =>
  Effect.gen(function* () {
    if (isDemoMode()) {
      return {
        ok: false,
        error: 'El modo demo no crea ni modifica espacios en la base de datos.',
      }
    }

    const attempt = yield* sendRequest('/api/state/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currency ? { currency } : {}),
    }).pipe(
      Effect.match({
        onSuccess: (response) => ({ ok: true as const, response }),
        onFailure: (cause) => ({
          ok: false as const,
          error: cause.cause instanceof Error ? cause.cause.message : 'Error de red',
        }),
      }),
    )

    if (!attempt.ok) return attempt
    const response = attempt.response

    const body = (yield* readJson(response).pipe(Effect.orElseSucceed(() => null))) as {
      ok?: boolean
      alreadyInitialized?: boolean
      error?: string
    } | null

    if (!response.ok || !body?.ok) {
      return { ok: false, error: body?.error ?? `El servidor respondió ${response.status}` }
    }

    return { ok: true, alreadyInitialized: Boolean(body.alreadyInitialized) }
  })
