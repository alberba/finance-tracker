/** Better Auth session and CSRF boundary for private pages and APIs. */

import { defineMiddleware } from 'astro/middleware'
import { getDb } from './db/client'
import { authenticatedPrincipal } from './db/repositories/authentication'
import { createAuthentication } from './lib/server/auth/better-auth'
import { resolvePrincipal, type AuthPrincipal } from './lib/server/auth/principal'
import { getRuntimeEnv, type RuntimeEnv } from './lib/server/cloudflare-env'
import { initServerErrorTracking } from './lib/server/error-tracking'
import { isPublicDemoNavigation } from './lib/server/demo-access'
import { isMaintenanceMode, maintenanceResponse } from './lib/server/maintenance'
import {
  isLocalTestRequest,
  rejectUnsafeApiMutation,
  requiresAuthentication,
} from './lib/server/request-security'
import { runServer } from './lib/server/runtime'

/** Test-only principal injection; requires TEST_AUTH_ENABLED and a loopback origin. */
export const TEST_USER_EMAIL_HEADER = 'X-Test-User-Email'
export const TEST_AUTH_PROVIDER = 'e2e-test-header'

function jsonUnauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function isTestAuthEnabled(env: RuntimeEnv | undefined): boolean {
  return env?.TEST_AUTH_ENABLED === 'true'
}

function publicOrigin(env: RuntimeEnv | undefined): string | undefined {
  try {
    return env?.BETTER_AUTH_URL ? new URL(env.BETTER_AUTH_URL).origin : undefined
  } catch {
    return undefined
  }
}

function wrongQueueIdentity(request: Request, pathname: string, userId: string): boolean {
  const queueIdentity = request.headers.get('X-Finance-User-Id')
  return Boolean((queueIdentity || pathname === '/api/sync') && queueIdentity !== userId)
}

export const onRequest = defineMiddleware(async (context, next) => {
  const env = getRuntimeEnv(context.locals)
  // Idempotente. En Node nadie más inicializa Sentry: sin esto no sale ningún evento.
  initServerErrorTracking(env?.SENTRY_DSN)

  if (isMaintenanceMode(env)) return maintenanceResponse(context.request)

  if (isPublicDemoNavigation(context.request)) return next()

  const pathname = new URL(context.request.url).pathname
  const publicAuthentication =
    pathname === '/login' || pathname === '/api/recover-access' || pathname.startsWith('/api/auth/')

  const unsafeMutation = rejectUnsafeApiMutation(context.request, publicOrigin(env))
  if (unsafeMutation) return unsafeMutation
  if (publicAuthentication) return next()

  // The test identity header is inert unless both conditions hold. Cf-Access
  // headers are intentionally ignored and can never create a principal.
  if (isTestAuthEnabled(env) && isLocalTestRequest(context.request)) {
    const testEmail = context.request.headers.get(TEST_USER_EMAIL_HEADER)?.trim().toLowerCase()
    if (testEmail) {
      let testPrincipal: AuthPrincipal | undefined
      try {
        testPrincipal = await runServer(
          getDb(context.locals),
          resolvePrincipal({
            provider: TEST_AUTH_PROVIDER,
            subject: testEmail,
            email: testEmail,
          }),
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'No se pudo resolver el principal de prueba.'
        console.warn(`[middleware] test-auth-shim failed: ${message}`)
      }
      if (testPrincipal) {
        if (wrongQueueIdentity(context.request, pathname, testPrincipal.userId)) {
          return jsonUnauthorized(
            'La cola pertenece a otra identidad. Vuelve a entrar con el mismo usuario.',
          )
        }
        context.locals.principal = testPrincipal
        const response = await next()
        response.headers.set('Cache-Control', 'no-store')
        return response
      }
    }
  }

  try {
    const db = getDb(context.locals)
    const auth = createAuthentication(db, env)
    const sessionResponse = await auth.api.getSession({
      headers: context.request.headers,
      query: { disableCookieCache: true },
      asResponse: true,
    })
    const session = (await sessionResponse.json()) as {
      user?: { id: string; emailVerified: boolean }
    } | null
    if (session?.user?.emailVerified) {
      context.locals.principal =
        (await runServer(db, authenticatedPrincipal(session.user.id))) ?? undefined
    }
    if (
      !context.locals.principal &&
      requiresAuthentication(context.request) &&
      !publicAuthentication
    ) {
      return pathname.startsWith('/api/')
        ? jsonUnauthorized('Inicia sesión para continuar.')
        : context.redirect('/login', 302)
    }
    if (
      context.locals.principal &&
      wrongQueueIdentity(context.request, pathname, context.locals.principal.userId)
    ) {
      return jsonUnauthorized(
        'La cola pertenece a otra identidad. Vuelve a entrar con el mismo usuario.',
      )
    }
    const response = await next()
    for (const cookie of sessionResponse.headers.getSetCookie())
      response.headers.append('Set-Cookie', cookie)
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch {
    return jsonUnauthorized('No se pudo comprobar la sesión.')
  }
})
