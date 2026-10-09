import type { APIRoute } from 'astro'
import { getDb } from '../../../db/client'
import { createAuthentication } from '../../../lib/server/auth/better-auth'
import { getRuntimeEnv } from '../../../lib/server/cloudflare-env'
import { jsonResponse } from '../../../lib/server/api-auth'

const handle: APIRoute = async ({ request, locals }) => {
  try {
    const response = await createAuthentication(getDb(locals), getRuntimeEnv(locals)).handler(
      request,
    )
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    console.warn('[auth] Request failed', error instanceof Error ? error.name : 'UnknownError')
    return jsonResponse({ error: 'El acceso no está disponible. Inténtalo de nuevo.' }, 503)
  }
}
export const GET = handle
export const POST = handle
