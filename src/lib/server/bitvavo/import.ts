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
import type {
  BitvavoPreview,
  BitvavoSyncCounts,
  BitvavoSyncStatus,
  DuplicateResolution,
} from '../../bitvavo-types'
import {
  InvalidCredential,
  fetchBitvavoHistory,
  localDateTime,
  type BitvavoCredentials,
  type ClientError,
} from './client'

/** Each sync re-reads this much before the cursor to catch remote corrections. */
export const SYNC_OVERLAP_MS = 7 * 86_400_000

const credentialSchema = z
  .object({
    apiKey: z.string().trim().min(1).max(512),
    apiSecret: z.string().trim().min(1).max(512),
  })
  .strict()

/** Credentials are optional once connected: omitting both keeps the stored key. */
export const connectionSchema = z
  .object({
    apiKey: z.string().trim().min(1).max(512).optional(),
    apiSecret: z.string().trim().min(1).max(512).optional(),
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

const PREVIEW_RETRY =
  'No se pudo completar la importación. Puedes reintentar la misma vista previa.'
const SYNC_RETRY = 'La sincronización se interrumpió. Reintenta: no se duplicará nada.'

/** A failure that leaves the range resumable: the same call can be retried. */
function resumable<A>(
  effect: Effect.Effect<A, unknown, DatabaseService>,
  message = PREVIEW_RETRY,
): Effect.Effect<A, ImportError, DatabaseService> {
  return effect.pipe(Effect.mapError(() => new ImportError({ message })))
}

/** First day requested from Bitvavo: UTC midnight minus a day covers every zone. */
function rangeStart(startDate: string): number {
  return Math.max(0, Date.parse(`${startDate}T00:00:00Z`) - 86_400_000)
}

/** Decrypts the stored key and leaves an audit entry of the read. */
function readCredential(userId: string, env: DataEncryptionEnv) {
  return Effect.gen(function* () {
    const credential = yield* credentials.getByProvider(userId, 'bitvavo', env)
    if (!credential) return yield* Effect.fail(new RejectedCommandError('Conecta Bitvavo primero.'))
    yield* repository.recordAudit(userId, 'credential_read', 'success')
    return yield* Effect.sync((): BitvavoCredentials =>
      credentialSchema.parse(JSON.parse(credential.secret)),
    )
  })
}

/** The message stored and shown for a failed attempt; never a provider body. */
function describeFailure(error: unknown): { status: 'failed' | 'attention'; error: string } {
  if (error instanceof DatabaseError) error = error.cause
  if (error instanceof InvalidCredential)
    return {
      status: 'attention',
      error: 'Bitvavo ha rechazado la clave. Reemplázala por una clave de solo lectura.',
    }
  if (
    error instanceof Error &&
    '_tag' in error &&
    ['RateLimit', 'ProviderError', 'ImportError', 'NonEuroOperation'].includes(String(error._tag))
  )
    return { status: 'failed', error: error.message }
  if (error instanceof RejectedCommandError) return { status: 'failed', error: error.message }
  return { status: 'failed', error: 'No se pudo completar la sincronización.' }
}

function recordFailure(userId: string, error: unknown) {
  const failure = describeFailure(error)
  return Effect.all([
    repository.recordFailure(userId, { ...failure, at: Date.now() }),
    repository.recordAudit(userId, 'sync', failure.status, { error: failure.error }),
  ]).pipe(Effect.ignore)
}

/** Rewrites local date and time of every imported movement from its UTC instant. */
function rematerialize(userId: string, accountId: string, timeZone: string, token: string) {
  return Effect.gen(function* () {
    let changed = 0
    for (const movement of yield* repository.listRemoteMovements(userId)) {
      const operation = movement.remoteOperation
      const next = {
        ...operation,
        timeZone,
        ...localDateTime(Date.parse(operation.executedAt), timeZone),
      }
      yield* resumable(repository.renew(userId, token), SYNC_RETRY)
      if ((yield* repository.applyOperation(userId, accountId, next, null)) === 'updated') changed++
    }
    return changed
  })
}

export function configureBitvavo(
  userId: string,
  env: DataEncryptionEnv,
  input: ConnectionInput,
): Effect.Effect<void, ImportFailure, DatabaseService | Http> {
  return Effect.gen(function* () {
    const config = yield* Effect.sync(() => connectionSchema.parse(input))
    const existing = yield* repository.getConnection(userId)
    if (Boolean(config.apiKey) !== Boolean(config.apiSecret)) {
      return yield* Effect.fail(new RejectedCommandError('Indica la API key y el secreto juntos.'))
    }
    const secret =
      config.apiKey && config.apiSecret
        ? { apiKey: config.apiKey, apiSecret: config.apiSecret }
        : null
    if (!existing && !secret) {
      return yield* Effect.fail(new RejectedCommandError('Indica la API key y el secreto.'))
    }
    const account = yield* accounts.get(userId, config.accountId)
    if (
      !account ||
      account.currency !== 'EUR' ||
      account.kind === 'liability' ||
      account.isArchived
    ) {
      return yield* Effect.fail(new RejectedCommandError('Selecciona una cuenta EUR propia.'))
    }
    if (existing?.lastSuccessAt != null && existing.accountId !== config.accountId) {
      return yield* Effect.fail(
        new RejectedCommandError(
          'La cuenta vinculada no puede cambiar después de la primera importación.',
        ),
      )
    }
    if (
      config.startDate >
      new Intl.DateTimeFormat('sv-SE', { timeZone: config.timeZone }).format(Date.now())
    ) {
      return yield* Effect.fail(
        new RejectedCommandError('La fecha inicial no puede estar en el futuro.'),
      )
    }
    let envelope = null
    if (secret) {
      // Validate the key using the same read-only endpoint before persisting it.
      yield* fetchBitvavoHistory(secret, {
        from: Date.now() - 86400000,
        to: Date.now(),
        timeZone: config.timeZone,
      }).pipe(
        Effect.tapError(() =>
          repository
            .recordAudit(userId, 'configure', 'failed', { credentialReplaced: true })
            .pipe(Effect.ignore),
        ),
      )
      envelope = yield* encryptValue(env, JSON.stringify(secret))
    }
    const settings = {
      accountId: config.accountId,
      startDate: config.startDate,
      timeZone: config.timeZone,
    }
    yield* repository.ensureConnection(userId, settings)
    const token = crypto.randomUUID()
    yield* repository.acquire(userId, token)
    const rematerialized = yield* Effect.gen(function* () {
      // An earlier start date brings more history; a later one deletes nothing.
      const resetCursor = !existing || config.startDate < existing.startDate
      yield* repository.saveConnection(userId, settings, envelope, token, resetCursor)
      // Idempotent: a retry after a partial failure finishes the remaining movements.
      return yield* rematerialize(userId, config.accountId, config.timeZone, token)
    }).pipe(Effect.ensuring(repository.release(userId, token).pipe(Effect.ignore)))
    yield* repository.recordAudit(userId, 'configure', 'success', {
      credentialReplaced: Boolean(envelope),
      startDateChanged: Boolean(existing && existing.startDate !== config.startDate),
      timeZoneChanged: Boolean(existing && existing.timeZone !== config.timeZone),
      rematerialized,
    })
  })
}

export function previewBitvavo(
  userId: string,
  env: DataEncryptionEnv,
): Effect.Effect<BitvavoPreview, ImportFailure, DatabaseService | Http> {
  return Effect.gen(function* () {
    const config = yield* repository.getConnection(userId)
    if (!config) return yield* Effect.fail(new RejectedCommandError('Conecta Bitvavo primero.'))
    const secret = yield* readCredential(userId, env)
    // Start at UTC midnight and filter by the configured local date to include all zones.
    const from = rangeStart(config.startDate)
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
): Effect.Effect<
  { imported: number; counts?: BitvavoSyncCounts },
  ImportFailure,
  DatabaseService | Http
> {
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
      const counts: BitvavoSyncCounts = {
        created: 0,
        updated: 0,
        unchanged: 0,
        skipped: preview.incompatible.length,
      }
      for (const operation of preview.operations) {
        yield* resumable(repository.renew(userId, token))
        const outcome = yield* resumable(
          repository.applyOperation(
            userId,
            preview.accountId,
            operation,
            choices.get(operation.externalId) ?? null,
          ),
        )
        counts[outcome]++
      }
      const status = yield* resumable(
        repository.finishRange(userId, token, {
          from: preview.from,
          to: preview.to,
          maxInstant: maxInstant(preview.operations),
          applied: preview.operations.map((op) => op.externalId),
          skipped: preview.incompatible.map((op) => ({ ...op, executedAt: op.executedAt ?? null })),
          counts,
          at: Date.now(),
          previewId,
        }),
      )
      yield* repository.recordAudit(userId, 'sync', status, { ...counts, initial: true })
      return { imported: counts.created, counts }
    }).pipe(Effect.ensuring(repository.release(userId, token).pipe(Effect.ignore)))
  })
}

function maxInstant(operations: ReadonlyArray<{ executedAt: string }>): number | null {
  const instants = operations.map((op) => Date.parse(op.executedAt)).filter(Number.isFinite)
  return instants.length ? Math.max(...instants) : null
}

export interface SyncResult {
  status: BitvavoSyncStatus
  counts: BitvavoSyncCounts
}

/**
 * Incremental sync after the first import: re-reads from the cursor minus an
 * overlap, classifies each operation by its identity and only then advances
 * the cursor. `retrySkipped` widens the range to re-query the skipped ones.
 * A failure is recorded as the last attempt and can be retried as is.
 */
export function syncBitvavo(
  userId: string,
  env: DataEncryptionEnv,
  options: { retrySkipped?: boolean } = {},
): Effect.Effect<SyncResult, ImportFailure, DatabaseService | Http> {
  return Effect.gen(function* () {
    const connection = yield* repository.getConnection(userId)
    if (!connection) return yield* Effect.fail(new RejectedCommandError('Conecta Bitvavo primero.'))
    if (connection.lastSuccessAt == null) {
      return yield* Effect.fail(
        new RejectedCommandError('Completa primero la importación inicial.'),
      )
    }
    const token = crypto.randomUUID()
    // One run per connection: the lease lives in the database, so it also holds across workers.
    yield* repository.acquire(userId, token)
    return yield* Effect.gen(function* () {
      const secret = yield* readCredential(userId, env)
      const start = rangeStart(connection.startDate)
      let from =
        connection.cursor == null ? start : Math.max(start, connection.cursor - SYNC_OVERLAP_MS)
      if (options.retrySkipped) {
        const instants = (yield* repository.listSkipped(userId))
          .map((op) => (op.executedAt ? Date.parse(op.executedAt) : NaN))
          .filter(Number.isFinite)
        if (instants.length) from = Math.max(start, Math.min(from, Math.min(...instants) - 1000))
      }
      const to = Date.now()
      const history = yield* fetchBitvavoHistory(secret, {
        from,
        to,
        timeZone: connection.timeZone,
        startDate: connection.startDate,
      })
      const operations = history.operations.filter((op) => op.date >= connection.startDate)
      const counts: BitvavoSyncCounts = {
        created: 0,
        updated: 0,
        unchanged: 0,
        skipped: history.incompatible.length,
      }
      for (const operation of operations) {
        yield* resumable(repository.renew(userId, token), SYNC_RETRY)
        const outcome = yield* resumable(
          repository.applyOperation(userId, connection.accountId, operation, null),
          SYNC_RETRY,
        )
        counts[outcome]++
      }
      const status = yield* resumable(
        repository.finishRange(userId, token, {
          from,
          to,
          maxInstant: maxInstant(operations),
          applied: operations.map((op) => op.externalId),
          skipped: history.incompatible,
          counts,
          at: Date.now(),
        }),
        SYNC_RETRY,
      )
      yield* repository.recordAudit(userId, 'sync', status, {
        ...counts,
        retrySkipped: Boolean(options.retrySkipped),
      })
      return { status, counts }
    }).pipe(
      Effect.tapError((error) => recordFailure(userId, error)),
      Effect.ensuring(repository.release(userId, token).pipe(Effect.ignore)),
    )
  })
}

/** Removes configuration and credential; the imported movements stay and keep their identity. */
export function disconnectBitvavo(
  userId: string,
): Effect.Effect<void, DatabaseError | RejectedCommandError, DatabaseService> {
  return Effect.gen(function* () {
    const connection = yield* repository.getConnection(userId)
    const token = crypto.randomUUID()
    if (connection) yield* repository.acquire(userId, token)
    yield* repository.disconnect(userId, token)
    yield* repository.recordAudit(userId, 'disconnect', 'success')
  })
}
