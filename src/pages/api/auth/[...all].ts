import type { APIRoute } from 'astro'
import { getDb } from '../../../db/client'
import { createAuthentication } from '../../../lib/server/auth/better-auth'
import { getRuntimeEnv } from '../../../lib/server/cloudflare-env'
import { reportAccessFailure } from '../../../lib/server/error-tracking'
import { jsonResponse } from '../../../lib/server/api-auth'

function unavailableResponse(): Response {
  return jsonResponse(
    {
      message: 'El acceso no está disponible. Inténtalo de nuevo.',
      reference: reportAccessFailure(),
    },
    503,
  )
}

const handle: APIRoute = async ({ request, locals }) => {
  try {
    const env = getRuntimeEnv(locals)
    const response = await createAuthentication(getDb(locals), env).handler(request)
    if (response.status >= 500) return unavailableResponse()
    const location = response.headers.get('Location')
    if (location && new URL(request.url).pathname.startsWith('/api/auth/callback/')) {
      const target = new URL(location, request.url)
      if (
        target.origin === new URL(env.BETTER_AUTH_URL ?? request.url).origin &&
        target.pathname === '/login' &&
        target.searchParams.has('error')
      ) {
        const reference = reportAccessFailure()
        if (reference) {
          target.searchParams.set('ref', reference)
          response.headers.set('Location', target.href)
        }
      }
    }
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    console.warn('[auth] Request failed', error instanceof Error ? error.name : 'UnknownError')
    return unavailableResponse()
  }
}
export const GET = handle
export const POST = handle
