import { Effect, Data } from 'effect'
import { z } from 'zod'
import Decimal from 'decimal.js'
import type { Db } from '../../../db/repositories/shared'
import { RejectedCommandError } from '../../../db/repositories/shared'
import * as repository from '../../../db/repositories/bitvavo'
import * as credentials from '../../../db/repositories/integration-credentials'
import * as accounts from '../../../db/repositories/accounts'
import * as transactions from '../../../db/repositories/transactions'
import { encryptValue, type DataEncryptionEnv } from '../crypto/data-encryption'
import type { BitvavoPreview, DuplicateResolution } from '../../bitvavo-types'
import { fetchBitvavoHistory, type BitvavoCredentials } from './client'
import { runWithDb } from '../../../db/database'

export class ImportError extends Data.TaggedError('ImportError')<{ message: string }> {}
export const connectionSchema = z
  .object({
    apiKey: z.string().trim().min(1).max(512),
    apiSecret: z.string().trim().min(1).max(512),
    accountId: z.string().min(1),
    startDate: z.iso.date(),
    timeZone: z.string().refine((zone) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone })
        return true
      } catch {
        return false
      }
    }),
  })
  .strict()
type ConnectionInput = z.infer<typeof connectionSchema>

function databaseCall<A>(call: () => Promise<A>) {
  return Effect.tryPromise({
    try: call,
    catch: () =>
      new ImportError({
        message: 'No se pudo completar la importación. Puedes reintentar la misma vista previa.',
      }),
  })
}

export async function configureBitvavo(
  db: Db,
  userId: string,
  env: DataEncryptionEnv,
  input: ConnectionInput,
  http: typeof fetch = fetch,
) {
  const config = connectionSchema.parse(input)
  const account = await runWithDb(db, accounts.get(userId, config.accountId))
  if (!account || account.currency !== 'EUR' || account.kind === 'liability' || account.isArchived)
    throw new RejectedCommandError('Selecciona una cuenta EUR propia.')
  if (
    config.startDate >
    new Intl.DateTimeFormat('sv-SE', { timeZone: config.timeZone }).format(Date.now())
  )
    throw new RejectedCommandError('La fecha inicial no puede estar en el futuro.')
  // Validate the key using the same read-only endpoint before persisting it.
  await fetchBitvavoHistory(
    config,
    { from: Date.now() - 86400000, to: Date.now(), timeZone: config.timeZone },
    http,
  )
  const secret = JSON.stringify({ apiKey: config.apiKey, apiSecret: config.apiSecret })
  // Transitional edge: the encryption effect has no dependencies, so the
  // orchestration below runs it directly until this module is Effect itself.
  const envelope = await Effect.runPromise(encryptValue(env, secret))
  const settings = {
    accountId: config.accountId,
    startDate: config.startDate,
    timeZone: config.timeZone,
  }
  await runWithDb(db, repository.ensureConnection(userId, settings))
  const token = crypto.randomUUID()
  await runWithDb(db, repository.acquire(userId, token))
  try {
    await runWithDb(db, repository.saveConnection(userId, settings, envelope, token))
  } finally {
    await runWithDb(db, repository.release(userId, token))
  }
}

export async function previewBitvavo(
  db: Db,
  userId: string,
  env: DataEncryptionEnv,
  http: typeof fetch = fetch,
): Promise<BitvavoPreview> {
  const config = await runWithDb(db, repository.getConnection(userId))
  const credential = await runWithDb(db, credentials.getByProvider(userId, 'bitvavo', env))
  if (!config || !credential) throw new RejectedCommandError('Conecta Bitvavo primero.')
  const secret: BitvavoCredentials = connectionSchema
    .pick({ apiKey: true, apiSecret: true })
    .parse(JSON.parse(credential.secret))
  // Start at UTC midnight and filter by the configured local date to include all zones.
  const from = Math.max(0, Date.parse(`${config.startDate}T00:00:00Z`) - 86400000)
  const to = Date.now()
  const history = await fetchBitvavoHistory(
    secret,
    { from, to, timeZone: config.timeZone, startDate: config.startDate },
    http,
  )
  const movements = await runWithDb(db, transactions.listByUser(userId))
  const details = await runWithDb(db, transactions.listTradeDetailsByTransactions(userId,
    movements.map((m) => m.id),))
  const preview: BitvavoPreview = {
    connectionVersion: config.version,
    id: crypto.randomUUID(),
    accountId: config.accountId,
    from,
    to,
    timeZone: config.timeZone,
    incompatible: history.incompatible,
    operations: history.operations
      .filter((op) => op.date >= config.startDate)
      .map((op) => ({
        ...op,
        alreadyImported: movements.some((m) => m.externalId === op.externalId),
        candidates: movements
          .filter((m) => {
            const detail = details.get(m.id)
            return (
              !m.remoteOperation &&
              m.type === 'investment' &&
              m.accountId === config.accountId &&
              m.date === op.date &&
              detail?.side === op.side &&
              detail.symbol?.toUpperCase() === op.symbol &&
              [
                Number(op.cashAmount),
                ...(op.side === 'sell'
                  ? // Historical manual sales used gross + fee instead of gross - fee.
                    [new Decimal(op.cashAmount).plus(new Decimal(op.fee).times(2)).toNumber()]
                  : []),
              ].some((amount) => Math.abs(Math.abs(m.amount) - amount) <= 0.02)
            )
          })
          .map((m) => ({ id: m.id, description: m.description || '', date: m.date })),
      })),
  }
  await runWithDb(db, repository.savePreview(userId, preview))
  return preview
}

export async function confirmBitvavo(
  db: Db,
  userId: string,
  previewId: string,
  resolutions: DuplicateResolution[],
) {
  const stored = await runWithDb(db, repository.getPreview(userId, previewId))
  const connection = await runWithDb(db, repository.getConnection(userId))
  if (!stored || !connection) throw new RejectedCommandError('Vista previa no encontrada.')
  if (stored.status === 'complete') return { imported: 0 }
  const preview = stored.preview
  if (
    preview.connectionVersion !== connection.version ||
    preview.accountId !== connection.accountId ||
    preview.timeZone !== connection.timeZone
  )
    throw new RejectedCommandError('La configuración cambió: genera otra vista previa.')
  const choices = new Map(resolutions.map((choice) => [choice.externalId, choice.transactionId]))
  if (choices.size !== resolutions.length) throw new RejectedCommandError('Resoluciones repetidas.')
  const selected = new Set<string>()
  for (const operation of preview.operations) {
    if (operation.alreadyImported) continue
    const choice = choices.get(operation.externalId)
    if (operation.candidates.length && choice === undefined)
      throw new RejectedCommandError('Resuelve todos los posibles duplicados.')
    if (choice != null) {
      if (
        !operation.candidates.some((candidate) => candidate.id === choice) ||
        selected.has(choice)
      )
        throw new RejectedCommandError('Vinculación manual inválida o repetida.')
      selected.add(choice)
    }
  }
  if (
    resolutions.some(
      (choice) =>
        !preview.operations.some(
          (op) => op.externalId === choice.externalId && op.candidates.length,
        ),
    )
  )
    throw new RejectedCommandError('Resolución fuera de la vista previa.')
  const serialized = JSON.stringify(
    [...resolutions].sort((a, b) => a.externalId.localeCompare(b.externalId)),
  )
  if (stored.resolutions && stored.resolutions !== serialized)
    throw new RejectedCommandError('Reanuda con las mismas resoluciones.')
  const token = crypto.randomUUID()
  await runWithDb(db, repository.acquire(userId, token))
  try {
    const current = await runWithDb(db, repository.getPreview(userId, previewId))
    if (current?.status === 'complete') return { imported: 0 }
    const active = await runWithDb(db, repository.getConnection(userId))
    if (active?.version !== preview.connectionVersion)
      throw new RejectedCommandError('La configuración cambió: genera otra vista previa.')
    if (current?.resolutions && current.resolutions !== serialized)
      throw new RejectedCommandError('Reanuda con las mismas resoluciones.')
    const account = await runWithDb(db, accounts.get(userId, preview.accountId))
    if (!account || account.currency !== 'EUR' || account.isArchived)
      throw new RejectedCommandError('La cuenta de destino ya no está disponible en EUR.')
    return await Effect.runPromise(
      Effect.gen(function* () {
        yield* databaseCall(() => runWithDb(db, repository.reservePreview(userId, previewId, serialized)))
        let imported = 0
        for (const operation of preview.operations) {
          yield* databaseCall(() => runWithDb(db, repository.renew(userId, token)))
          if (
            yield* databaseCall(() =>
              runWithDb(db, repository.importOperation(userId,
                preview.accountId,
                operation,
                choices.get(operation.externalId) ?? null,)),
            )
          )
            imported++
        }
        yield* databaseCall(() => runWithDb(db, repository.finishPreview(userId, preview, token)))
        return { imported }
      }),
    )
  } finally {
    await runWithDb(db, repository.release(userId, token))
  }
}
