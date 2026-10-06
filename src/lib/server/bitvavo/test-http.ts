import { z } from 'zod'
import type { RuntimeEnv } from '../cloudflare-env'
import type { AuthPrincipal } from '../auth/principal'
import { isLocalTestRequest } from '../request-security'
import { RejectedCommandError } from '../../../db/repositories/shared'

/** Uses the local test-auth boundary; test identities can never call the real provider. */
export function bitvavoHttpForRequest(
  request: Request,
  principal: AuthPrincipal,
  env: RuntimeEnv,
): typeof fetch {
  if (
    principal.provider !== 'e2e-test-header' ||
    env.TEST_AUTH_ENABLED !== 'true' ||
    !isLocalTestRequest(request)
  )
    return fetch
  return async () => {
    const fixture = request.headers.get('X-Test-Bitvavo-History')
    if (!fixture || fixture.length > 16000)
      throw new RejectedCommandError(
        'Se requiere un historial simulado para la identidad de pruebas.',
      )
    const items = z.array(z.unknown()).parse(JSON.parse(fixture))
    return Response.json({ items, currentPage: 1, totalPages: 1 })
  }
}
