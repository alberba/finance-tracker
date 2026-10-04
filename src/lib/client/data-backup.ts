/**
 * Backup and restore of the v2 dataset for the Datos page: wraps
 * `GET /api/data/export` and `POST /api/data/import?mode=replace`.
 *
 * The file is the server's relational export, not the in-memory `State`,
 * so restoring it rebuilds the user's rows in D1. The legacy whole-state JSON
 * has another shape and is refused before it reaches the server.
 */

import { DATA_EXPORT_FORMAT } from '../data-export-format'

export type BackupResult<T> = { ok: true; value: T } | { ok: false; error: string }

export async function fetchBackup(): Promise<BackupResult<string>> {
  try {
    const response = await fetch('/api/data/export')
    if (!response.ok) {
      return { ok: false, error: `El servidor respondió ${response.status}` }
    }
    return { ok: true, value: JSON.stringify(await response.json(), null, 2) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Error de red' }
  }
}

export async function restoreBackup(content: string): Promise<BackupResult<{ skipped: number }>> {
  let payload: unknown
  try {
    payload = JSON.parse(content)
  } catch {
    return { ok: false, error: 'El archivo no es un JSON válido.' }
  }
  if (
    !payload ||
    typeof payload !== 'object' ||
    (payload as { format?: unknown }).format !== DATA_EXPORT_FORMAT
  ) {
    return {
      ok: false,
      error:
        'El archivo no es una copia exportada desde esta versión. Exporta de nuevo desde Datos.',
    }
  }
  try {
    const response = await fetch('/api/data/import?mode=replace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: content,
    })
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean
      error?: string
      skipped?: Record<string, number>
    } | null
    if (!response.ok || !body?.ok) {
      return { ok: false, error: body?.error ?? `El servidor respondió ${response.status}` }
    }
    const skipped = Object.values(body.skipped ?? {}).reduce((total, count) => total + count, 0)
    return { ok: true, value: { skipped } }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Error de red' }
  }
}
