/** "Empezar de cero" replaces the authenticated user's data with an empty space. */

import { isDemoMode } from '../../scripts/demo-mode'

export interface ResetResult {
  ok: boolean
  error?: string
}

export async function resetState(): Promise<ResetResult> {
  if (isDemoMode()) {
    return { ok: false, error: 'El modo demo no crea ni modifica espacios en la base de datos.' }
  }
  try {
    const response = await fetch('/api/state/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean
      error?: string
    } | null

    if (!response.ok || !body?.ok) {
      return { ok: false, error: body?.error ?? `El servidor respondió ${response.status}` }
    }

    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Error de red' }
  }
}
