import { Data, Effect } from 'effect'
import { z } from 'zod'
import Decimal from 'decimal.js'
import { RejectedCommandError } from '../../../db/repositories/shared'
import { DatabaseError, type Database as DatabaseService } from '../../../db/database'
import { DataEncryptionError } from '../crypto/data-encryption'
import { Http } from '../http'
import * as repository from '../../../db/repositories/bitvavo'
import * as credentials from '../../../db/repositories/integration-credentials'
import * as accounts from '../../../db/repositories/accounts'
import * as transactions from '../../../db/repositories/transactions'
import { encryptValue, type DataEncryptionEnv } from '../crypto/data-encryption'
import type { BitvavoPreview, DuplicateResolution } from '../../bitvavo-types'
import { fetchBitvavoHistory, type BitvavoCredentials, type ClientError } from './client'

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

export class ImportError extends Data.TaggedError('ImportError')<{ message: string }> {}

type ImportFailure =
  DatabaseError | DataEncryptionError | RejectedCommandError | ClientError | ImportError

/** A failure that leaves the preview resumable: the same call can be retried. */
function resumable<A>(
  effect: Effect.Effect<A, unknown, DatabaseService>,
): Effect.Effect<A, ImportError, DatabaseService> {
  return effect.pipe(
    Effect.mapError(
      () =>
        new ImportError({
          message: 'No se pudo completar la importación. Puedes reintentar la misma vista previa.',
        }),
    ),
  )
}

export function configureBitvavo(
  userId: string,
  env: DataEncryptionEnv,
  input: ConnectionInput,
): Effect.Effect<void, ImportFailure, DatabaseService | Http> {
  return Effect.gen(function* () {
    const config = yield* Effect.sync(() => connectionSchema.parse(input))
    const account = yield* accounts.get(userId, config.accountId)
    if (
      !account ||
      account.currency !== 'EUR' ||
      account.kind === 'liability' ||
      account.isArchived
    ) {
      return yield* Effect.fail(new RejectedCommandError('Selecciona una cuenta EUR propia.'))
    }
    if (
      config.startDate >
      new Intl.DateTimeFormat('sv-SE', { timeZone: config.timeZone }).format(Date.now())
    ) {
      return yield* Effect.fail(
        new RejectedCommandError('La fecha inicial no puede estar en el futuro.'),
      )
    }
    // Validate the key using the same read-only endpoint before persisting it.
    yield* fetchBitvavoHistory(config, {
      from: Date.now() - 86400000,
      to: Date.now(),
      timeZone: config.timeZone,
    })
    const secret = JSON.stringify({ apiKey: config.apiKey, apiSecret: config.apiSecret })
    const envelope = yield* encryptValue(env, secret)
    const settings = {
      accountId: config.accountId,
      startDate: config.startDate,
      timeZone: config.timeZone,
    }
    yield* repository.ensureConnection(userId, settings)
    const token = crypto.randomUUID()
    yield* repository.acquire(userId, token)
    yield* repository
      .saveConnection(userId, settings, envelope, token)
      .pipe(Effect.ensuring(repository.release(userId, token).pipe(Effect.ignore)))
  })
}

export function previewBitvavo(
  userId: string,
  env: DataEncryptionEnv,
): Effect.Effect<BitvavoPreview, ImportFailure, DatabaseService | Http> {
  return Effect.gen(function* () {
    const config = yield* repository.getConnection(userId)
    const credential = yield* credentials.getByProvider(userId, 'bitvavo', env)
    if (!config || !credential) {
      return yield* Effect.fail(new RejectedCommandError('Conecta Bitvavo primero.'))
    }
    const secret: BitvavoCredentials = yield* Effect.sync(() =>
      connectionSchema.pick({ apiKey: true, apiSecret: true }).parse(JSON.parse(credential.secret)),
    )
    // Start at UTC midnight and filter by the configured local date to include all zones.
    const from = Math.max(0, Date.parse(`${config.startDate}T00:00:00Z`) - 86400000)
    const to = Date.now()
    const history = yield* fetchBitvavoHistory(secret, {
      from,
      to,
      timeZone: config.timeZone,
      startDate: config.startDate,
    })
    const movements = yield* transactions.listByUser(userId)
    const details = yield* transactions.listTradeDetailsByTransactions(
      userId,
      movements.map((m) => m.id),
    )
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
    yield* repository.savePreview(userId, preview)
    return preview
  })
}

export function confirmBitvavo(
  userId: string,
  previewId: string,
  resolutions: DuplicateResolution[],
): Effect.Effect<{ imported: number }, ImportFailure, DatabaseService | Http> {
  return Effect.gen(function* () {
    const stored = yield* repository.getPreview(userId, previewId)
    const connection = yield* repository.getConnection(userId)
    if (!stored || !connection) {
      return yield* Effect.fail(new RejectedCommandError('Vista previa no encontrada.'))
    }
    if (stored.status === 'complete') return { imported: 0 }
    const preview = stored.preview
    if (
      preview.connectionVersion !== connection.version ||
      preview.accountId !== connection.accountId ||
      preview.timeZone !== connection.timeZone
    ) {
      return yield* Effect.fail(
        new RejectedCommandError('La configuración cambió: genera otra vista previa.'),
      )
    }
    const choices = new Map(resolutions.map((choice) => [choice.externalId, choice.transactionId]))
    if (choices.size !== resolutions.length) {
      return yield* Effect.fail(new RejectedCommandError('Resoluciones repetidas.'))
    }
    const selected = new Set<string>()
    for (const operation of preview.operations) {
      if (operation.alreadyImported) continue
      const choice = choices.get(operation.externalId)
      if (operation.candidates.length && choice === undefined) {
        return yield* Effect.fail(
          new RejectedCommandError('Resuelve todos los posibles duplicados.'),
        )
      }
      if (choice != null) {
        if (
          !operation.candidates.some((candidate) => candidate.id === choice) ||
          selected.has(choice)
        ) {
          return yield* Effect.fail(
            new RejectedCommandError('Vinculación manual inválida o repetida.'),
          )
        }
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
    ) {
      return yield* Effect.fail(new RejectedCommandError('Resolución fuera de la vista previa.'))
    }
    const serialized = JSON.stringify(
      [...resolutions].sort((a, b) => a.externalId.localeCompare(b.externalId)),
    )
    if (stored.resolutions && stored.resolutions !== serialized) {
      return yield* Effect.fail(new RejectedCommandError('Reanuda con las mismas resoluciones.'))
    }
    const token = crypto.randomUUID()
    yield* repository.acquire(userId, token)
    return yield* Effect.gen(function* () {
      const current = yield* repository.getPreview(userId, previewId)
      if (current?.status === 'complete') return { imported: 0 }
      const active = yield* repository.getConnection(userId)
      if (active?.version !== preview.connectionVersion) {
        return yield* Effect.fail(
          new RejectedCommandError('La configuración cambió: genera otra vista previa.'),
        )
      }
      if (current?.resolutions && current.resolutions !== serialized) {
        return yield* Effect.fail(new RejectedCommandError('Reanuda con las mismas resoluciones.'))
      }
      const account = yield* accounts.get(userId, preview.accountId)
      if (!account || account.currency !== 'EUR' || account.isArchived) {
        return yield* Effect.fail(
          new RejectedCommandError('La cuenta de destino ya no está disponible en EUR.'),
        )
      }
      yield* resumable(repository.reservePreview(userId, previewId, serialized))
      let imported = 0
      for (const operation of preview.operations) {
        yield* resumable(repository.renew(userId, token))
        const applied = yield* resumable(
          repository.importOperation(
            userId,
            preview.accountId,
            operation,
            choices.get(operation.externalId) ?? null,
          ),
        )
        if (applied) imported++
      }
      yield* resumable(repository.finishPreview(userId, preview, token))
      return { imported }
    }).pipe(Effect.ensuring(repository.release(userId, token).pipe(Effect.ignore)))
  })
}
