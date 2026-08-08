import { StockEventsApiError } from '../../../lib/server/stockevents'
import { createJsonResponse } from '../../../lib/server/json-response'
import { getDb } from '../../../db/client'
import { getRuntimeEnvFromLocals } from '../../../lib/server/cloudflare-env'
import { integrationCredentialsRepository } from '../../../db/repositories'

export const json = createJsonResponse('no-store')

const STOCKEVENTS_PROVIDER = 'stockevents'

/** Header-supplied key — the legacy path (Contradiction #7's JSON-blob key,
 *  forwarded by the client on every request). Kept as a fallback until
 *  cutover (WP11) so unauthenticated/pre-migration requests keep working. */
function readApiKeyFromHeader(request: Request): string {
  return String(request.headers.get('x-stockevents-key') || '').trim()
}

/**
 * Resolves the Stock Events API key for the current request.
 *
 * When an authenticated principal is present (`locals.principal`, WP3), the
 * encrypted `integration_credentials` repository (WP12) is tried first; on
 * any failure (no stored credential yet, v2 binding unavailable, decryption
 * error) this falls back to the `x-stockevents-key` header the client sends
 * today — the whole-state JSON-blob path is not removed until cutover, per
 * this WP's scope.
 */
export async function readApiKey(request: Request, locals: App.Locals): Promise<string> {
  const principal = locals.principal
  if (principal) {
    try {
      const db = getDb(locals)
      const env = getRuntimeEnvFromLocals(locals)
      const credential = await integrationCredentialsRepository.getByProvider(
        db,
        principal.userId,
        STOCKEVENTS_PROVIDER,
        env,
      )
      if (credential?.secret) {
        return credential.secret
      }
    } catch {
      // Best-effort: no v2 binding configured, no stored credential yet,
      // or decryption failure — fall through to the header path below.
    }
  }
  return readApiKeyFromHeader(request)
}

export function errorResponse(error: unknown): Response {
  if (error instanceof StockEventsApiError) {
    return json({ error: error.message }, error.status >= 400 ? error.status : 502)
  }
  const message = error instanceof Error ? error.message : 'Error al contactar con Stock Events'
  return json({ error: message }, 502)
}
