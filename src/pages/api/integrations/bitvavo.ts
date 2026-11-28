import { bitvavoHttpForRequest } from '../../../lib/server/bitvavo/test-http'
import * as accounts from '../../../db/repositories/accounts'
import type { APIRoute } from 'astro'
import { z } from 'zod'
import { getDb } from '../../../db/client'
import { RejectedCommandError } from '../../../db/repositories/shared'
import * as repository from '../../../db/repositories/bitvavo'
import { getRuntimeEnvFromLocals } from '../../../lib/server/cloudflare-env'
import { jsonResponse, requirePrincipal, withApiErrorHandling } from '../../../lib/server/api-auth'
import {
  configureBitvavo,
  previewBitvavo,
  confirmBitvavo,
  syncBitvavo,
  disconnectBitvavo,
  connectionSchema,
  ImportError,
} from '../../../lib/server/bitvavo/import'
import { InvalidCredential, RateLimit, NonEuroOperation, ProviderError } from '../../../lib/server/bitvavo/client'
import type { BitvavoConnectionState } from '../../../lib/bitvavo-types'
import { runServer } from '../../../lib/server/runtime'
import { DataEncryptionError } from '../../../lib/server/crypto/data-encryption'

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preview') }).strict(),
  z.object({ action: z.literal('sync') }).strict(),
  z.object({ action: z.literal('retrySkipped') }).strict(),
  z.object({ action: z.literal('confirm'), previewId: z.string(), resolutions: z.array(z.object({ externalId: z.string(), transactionId: z.string().nullable() }).strict()) }).strict(),
  z.object({ action: z.literal('linkInstrument'), transactionId: z.string(), instrumentId: z.string() }).strict(),
])

async function handle(locals: App.Locals, work: (context: { db: ReturnType<typeof getDb>; userId: string; env: ReturnType<typeof getRuntimeEnvFromLocals> }) => Promise<Response>) {
  return withApiErrorHandling('/api/integrations/bitvavo', async () => {
    const principal = requirePrincipal(locals)
    const context = { db: getDb(locals), userId: principal.userId, env: getRuntimeEnvFromLocals(locals) }
    try { return await work(context) }
    catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) return jsonResponse({ error: 'Configuración o solicitud inválida.' }, 400)
      if (error instanceof RejectedCommandError || error instanceof NonEuroOperation) return jsonResponse({ error: error.message }, 409)
      if (error instanceof InvalidCredential) return jsonResponse({ error: error.message }, 422)
      if (error instanceof RateLimit) return jsonResponse({ error: error.message }, 429)
      // Our own sanitized messages: the provider body never reaches the client.
      if (error instanceof DataEncryptionError) return jsonResponse({ error: `Cifrado de credenciales: ${error.message}` }, 503)
      if (error instanceof ProviderError || error instanceof ImportError) return jsonResponse({ error: error.message }, 502)
      throw error
    }
  })
}
export const GET: APIRoute = async ({ locals }) => handle(locals, async ({ db, userId }) => {
  const connection = await runServer(db, repository.getConnection(userId))
  const instruments = (await runServer(db, repository.listInstruments(userId))).map(instrument => ({ id: instrument.id, symbol: instrument.symbol, name: instrument.name }))
  const destinations = (await runServer(db, accounts.listByUser(userId))).filter(account => account.currency === 'EUR' && account.kind !== 'liability' && !account.isArchived).map(account => ({ id: account.id, name: account.name }))
  const state: BitvavoConnectionState | null = connection
    ? {
        accountId: connection.accountId,
        startDate: connection.startDate,
        timeZone: connection.timeZone,
        cursor: connection.cursor,
        imported: connection.lastSuccessAt != null,
        needsAttention: connection.needsAttention,
        lastAttemptAt: connection.lastAttemptAt,
        lastAttemptStatus: connection.lastAttemptStatus,
        lastError: connection.lastError,
        lastSuccessAt: connection.lastSuccessAt,
        lastCounts: connection.lastCounts,
        skipped: await runServer(db, repository.listSkipped(userId)),
      }
    : null
  return jsonResponse({ configured: Boolean(connection), destinations, instruments, connection: state }, 200)
})
export const PUT: APIRoute = async ({ locals, request }) => handle(locals, async ({ db, userId, env }) => {
  await runServer(
    db,
    configureBitvavo(userId, env, connectionSchema.parse(await request.json())),
    bitvavoHttpForRequest(request, requirePrincipal(locals), env),
  )
  return jsonResponse({ configured: true }, 200)
})
export const POST: APIRoute = async ({ locals, request }) => handle(locals, async ({ db, userId, env }) => {
  const action = actionSchema.parse(await request.json())
  switch (action.action) {
    case 'preview': return jsonResponse(await runServer(db, previewBitvavo(userId, env), bitvavoHttpForRequest(request, requirePrincipal(locals), env)), 200)
    case 'sync':
    case 'retrySkipped':
      return jsonResponse(await runServer(db, syncBitvavo(userId, env, { retrySkipped: action.action === 'retrySkipped' }), bitvavoHttpForRequest(request, requirePrincipal(locals), env)), 200)
    case 'confirm': return jsonResponse(await runServer(db, confirmBitvavo(userId, action.previewId, action.resolutions)), 200)
    case 'linkInstrument': await runServer(db, repository.linkInstrument(userId, action.transactionId, action.instrumentId)); return jsonResponse({ linked: true }, 200)
  }
})
export const DELETE: APIRoute = async ({ locals }) => handle(locals, async ({ db, userId }) => {
  await runServer(db, disconnectBitvavo(userId))
  return jsonResponse({ configured: false }, 200)
})
