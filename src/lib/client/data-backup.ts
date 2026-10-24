/**
 * Backup and restore of the v2 dataset for the Datos page: wraps
 * `GET /api/data/export` and `POST /api/data/import?mode=replace`.
 *
 * The file is the server's relational export, not the in-memory `State`,
 * so restoring it rebuilds the user's rows in D1. The legacy whole-state JSON
 * has another shape and is refused before it reaches the server.
 *
 * Both operations report failure as a value (`BackupResult`) because the Datos
 * page shows it inline; the transport is still typed, so callers run the
 * effect at their edge.
 */

import { Effect } from 'effect'

import { DATA_EXPORT_FORMAT } from '../data-export-format'
import { readJson, sendRequest, type ClientHttp } from './http'

export type BackupResult<T> = { ok: true; value: T } | { ok: false; error: string }

export const fetchBackup = (): Effect.Effect<BackupResult<string>, never, ClientHttp> =>
  Effect.gen(function* () {
    const attempt = yield* sendRequest('/api/data/export').pipe(
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
    if (!response.ok) {
      return { ok: false, error: `El servidor respondió ${response.status}` }
    }
    const body = yield* readJson(response).pipe(Effect.orElseSucceed(() => null))
    return { ok: true, value: JSON.stringify(body, null, 2) }
  })

export const restoreBackup = (
  content: string,
): Effect.Effect<BackupResult<{ skipped: number }>, never, ClientHttp> =>
  Effect.gen(function* () {
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

    const attempt = yield* sendRequest('/api/data/import?mode=replace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: content,
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
      error?: string
      skipped?: Record<string, number>
    } | null
    if (!response.ok || !body?.ok) {
      return { ok: false, error: body?.error ?? `El servidor respondió ${response.status}` }
    }
    const skipped = Object.values(body.skipped ?? {}).reduce((total, count) => total + count, 0)
    return { ok: true, value: { skipped } }
  })
