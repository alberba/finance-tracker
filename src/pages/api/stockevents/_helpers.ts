import { StockEventsApiError } from '../../../lib/server/stockevents'
import { createJsonResponse } from '../../../lib/server/json-response'
import { getDb } from '../../../db/client'
import { getRuntimeEnvFromLocals } from '../../../lib/server/cloudflare-env'
import { integrationCredentialsRepository } from '../../../db/repositories'
import { requirePrincipal } from '../../../lib/server/api-auth'
import { runWithDb } from '../../../db/database'

export const json = createJsonResponse('no-store')

const STOCKEVENTS_PROVIDER = 'stockevents'

export async function readApiKey(locals: App.Locals): Promise<string> {
  const principal = requirePrincipal(locals)
  const db = getDb(locals)
  const env = getRuntimeEnvFromLocals(locals)
  const credential = await runWithDb(
    db,
    integrationCredentialsRepository.getByProvider(principal.userId, STOCKEVENTS_PROVIDER, env),
  )
  return credential?.secret ?? ''
}

export function errorResponse(error: unknown): Response {
  if (error instanceof StockEventsApiError) {
    return json({ error: error.message }, error.status >= 400 ? error.status : 502)
  }
  console.error('[stockevents] Provider request failed', error)
  return json({ error: 'Error al contactar con Stock Events' }, 502)
}
