import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import Decimal from 'decimal.js'
import {
  bitvavoConnections,
  bitvavoPreviews,
  bitvavoSkipped,
  integrationAuditEvents,
  investmentTradeDetails,
  transactions,
  userRevisions,
  syncChanges,
  integrationCredentials,
} from '../schema'
import type { EncryptedEnvelope } from '../../lib/server/crypto/data-encryption'
import {
  nowIso,
  runInTransaction,
  type Db,
  RejectedCommandError,
  assertOwnedReferences,
} from './shared'
import * as transactionRepository from './transactions'
import * as market from './market'
import { lift, runWithDb } from '../database'
import type {
  BitvavoPreview,
  BitvavoSyncCounts,
  BitvavoSyncStatus,
  RemoteOperation,
  SkippedOperation,
} from '../../lib/bitvavo-types'

async function getConnectionSql(db: Db, userId: string) {
  const [row] = await db
    .select()
    .from(bitvavoConnections)
    .where(eq(bitvavoConnections.userId, userId))
  return row
}
async function ensureConnectionSql(
  db: Db,
  userId: string,
  input: { accountId: string; startDate: string; timeZone: string },
) {
  await db
    .insert(bitvavoConnections)
    .values({ userId, ...input })
    .onConflictDoNothing()
}
async function saveConnectionSql(
  db: Db,
  userId: string,
  input: { accountId: string; startDate: string; timeZone: string },
  envelope: EncryptedEnvelope | null,
  token: string,
  resetCursor: boolean,
) {
  const existing = await getConnectionSql(db, userId)
  if (existing?.lockToken !== token)
    throw new RejectedCommandError('La reserva de Bitvavo ha caducado.')
  await assertOwnedReferences(db, userId, { accountId: input.accountId })
  const now = nowIso()
  await atomic(db, [
    db
      .update(bitvavoConnections)
      .set({
        ...input,
        // An earlier start date rescans from it; identities keep it idempotent.
        ...(resetCursor ? { cursor: null } : {}),
        // A replaced credential clears «Requiere atención».
        ...(envelope ? { needsAttention: false } : {}),
        version: sql`${bitvavoConnections.version} + 1`,
      })
      .where(eq(bitvavoConnections.userId, userId)),
    ...(envelope
      ? [
          db
            .insert(integrationCredentials)
            .values({ userId, provider: 'bitvavo', ...envelope, createdAt: now, updatedAt: now })
            .onConflictDoUpdate({
              target: [integrationCredentials.userId, integrationCredentials.provider],
              set: {
                ...envelope,
                updatedAt: now,
                version: sql`${integrationCredentials.version} + 1`,
              },
            }),
        ]
      : []),
  ])
}
async function acquireSql(db: Db, userId: string, token: string) {
  const rows = await db
    .update(bitvavoConnections)
    .set({ lockToken: token, lockUntil: Date.now() + 600000 })
    .where(
      and(
        eq(bitvavoConnections.userId, userId),
        or(isNull(bitvavoConnections.lockToken), lt(bitvavoConnections.lockUntil, Date.now())),
      ),
    )
    .returning()
  if (!rows.length) throw new RejectedCommandError('Ya hay una sincronización Bitvavo en curso.')
}
async function renewSql(db: Db, userId: string, token: string) {
  const rows = await db
    .update(bitvavoConnections)
    .set({ lockUntil: Date.now() + 600000 })
    .where(and(eq(bitvavoConnections.userId, userId), eq(bitvavoConnections.lockToken, token)))
    .returning()
  if (!rows.length)
    throw new RejectedCommandError('La reserva de Bitvavo ha caducado. Reintenta la importación.')
}
async function releaseSql(db: Db, userId: string, token: string) {
  await db
    .update(bitvavoConnections)
    .set({ lockToken: null, lockUntil: 0 })
    .where(and(eq(bitvavoConnections.userId, userId), eq(bitvavoConnections.lockToken, token)))
}
/**
 * Drops the user's Bitvavo connection and any previews it left behind.
 *
 * `bitvavo_connections.account_id` references `accounts(id)` without a
 * cascade, so a reset/restore that deletes the user's accounts must remove
 * the connection first (otherwise the FK fails with a raw constraint error).
 * The caller owns the transaction; this function only issues the deletes.
 */
async function removeConnectionSql(db: Db, userId: string) {
  await db.delete(bitvavoPreviews).where(eq(bitvavoPreviews.userId, userId))
  await db.delete(bitvavoSkipped).where(eq(bitvavoSkipped.userId, userId))
  await db.delete(bitvavoConnections).where(eq(bitvavoConnections.userId, userId))
}
async function savePreviewSql(db: Db, userId: string, preview: BitvavoPreview) {
  await db
    .insert(bitvavoPreviews)
    .values({ id: preview.id, userId, preview, createdAt: Date.now() })
}
async function getPreviewSql(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(bitvavoPreviews)
    .where(and(eq(bitvavoPreviews.userId, userId), eq(bitvavoPreviews.id, id)))
  return row
}
async function reservePreviewSql(db: Db, userId: string, id: string, resolutions: string) {
  await db
    .update(bitvavoPreviews)
    .set({ status: 'processing', resolutions })
    .where(and(eq(bitvavoPreviews.userId, userId), eq(bitvavoPreviews.id, id)))
}
export interface CompletedRange {
  from: number
  to: number
  /** Greatest remote instant of the range; the cursor never goes back. */
  maxInstant: number | null
  /** Identities applied (created, updated or unchanged) in the range. */
  applied: string[]
  skipped: SkippedOperation[]
  counts: BitvavoSyncCounts
  at: number
  previewId?: string
}

/**
 * Closes a fully applied range in one write: the cursor advances, the skipped
 * operations of the range are replaced and the attempt is recorded as correct.
 * Skipped rows outside the range stay until a range covers them again.
 */
async function finishRangeSql(
  db: Db,
  userId: string,
  token: string,
  range: CompletedRange,
): Promise<BitvavoSyncStatus> {
  const connection = await getConnectionSql(db, userId)
  if (connection?.lockToken !== token)
    throw new RejectedCommandError(
      'La reserva de Bitvavo ha caducado. Reintenta la sincronización.',
    )
  const current = await listSkippedSql(db, userId)
  const applied = new Set(range.applied)
  const skippedNow = new Set(range.skipped.map((op) => op.externalId))
  const stale = current
    .filter((row) => {
      if (applied.has(row.externalId)) return true
      if (skippedNow.has(row.externalId) || !row.executedAt) return false
      const instant = Date.parse(row.executedAt)
      return instant >= range.from && instant <= range.to
    })
    .map((row) => row.externalId)
  const remaining = new Set([
    ...current.map((row) => row.externalId).filter((id) => !stale.includes(id)),
    ...skippedNow,
  ])
  const status: BitvavoSyncStatus = remaining.size ? 'warning' : 'success'
  await atomic(db, [
    db
      .update(bitvavoConnections)
      .set({
        ...(range.maxInstant == null
          ? {}
          : {
              cursor: sql`max(coalesce(${bitvavoConnections.cursor}, ${range.maxInstant}), ${range.maxInstant})`,
            }),
        lastAttemptAt: range.at,
        lastAttemptStatus: status,
        lastError: null,
        lastSuccessAt: range.at,
        lastCounts: range.counts,
        needsAttention: false,
      })
      .where(and(eq(bitvavoConnections.userId, userId), eq(bitvavoConnections.lockToken, token))),
    ...(stale.length
      ? [
          db
            .delete(bitvavoSkipped)
            .where(
              and(eq(bitvavoSkipped.userId, userId), inArray(bitvavoSkipped.externalId, stale)),
            ),
        ]
      : []),
    ...range.skipped.map((op) =>
      db
        .insert(bitvavoSkipped)
        .values({ userId, externalId: op.externalId, executedAt: op.executedAt, reason: op.reason })
        .onConflictDoUpdate({
          target: [bitvavoSkipped.userId, bitvavoSkipped.externalId],
          set: { executedAt: op.executedAt, reason: op.reason },
        }),
    ),
    ...(range.previewId
      ? [
          db
            .update(bitvavoPreviews)
            .set({ status: 'complete' })
            .where(
              and(eq(bitvavoPreviews.userId, userId), eq(bitvavoPreviews.id, range.previewId)),
            ),
        ]
      : []),
  ])
  return status
}

/** A failed attempt never touches the cursor; a rejected credential asks for attention. */
async function recordFailureSql(
  db: Db,
  userId: string,
  failure: { status: 'failed' | 'attention'; error: string; at: number },
) {
  await db
    .update(bitvavoConnections)
    .set({
      lastAttemptAt: failure.at,
      lastAttemptStatus: failure.status,
      lastError: failure.error,
      ...(failure.status === 'attention' ? { needsAttention: true } : {}),
    })
    .where(eq(bitvavoConnections.userId, userId))
}

async function listSkippedSql(db: Db, userId: string): Promise<SkippedOperation[]> {
  const rows = await db
    .select({
      externalId: bitvavoSkipped.externalId,
      executedAt: bitvavoSkipped.executedAt,
      reason: bitvavoSkipped.reason,
    })
    .from(bitvavoSkipped)
    .where(eq(bitvavoSkipped.userId, userId))
  return rows.sort((a, b) => (b.executedAt ?? '').localeCompare(a.executedAt ?? ''))
}

/** Removes configuration, credential, previews and skipped; imported movements stay. */
async function disconnectSql(db: Db, userId: string, token: string) {
  const connection = await getConnectionSql(db, userId)
  if (connection && connection.lockToken !== token)
    throw new RejectedCommandError('La reserva de Bitvavo ha caducado.')
  await atomic(db, [
    db.delete(bitvavoPreviews).where(eq(bitvavoPreviews.userId, userId)),
    db.delete(bitvavoSkipped).where(eq(bitvavoSkipped.userId, userId)),
    db.delete(bitvavoConnections).where(eq(bitvavoConnections.userId, userId)),
    db
      .delete(integrationCredentials)
      .where(
        and(
          eq(integrationCredentials.userId, userId),
          eq(integrationCredentials.provider, 'bitvavo'),
        ),
      ),
  ])
}

export type AuditAction = 'configure' | 'credential_read' | 'sync' | 'disconnect'
export type AuditOutcome = 'success' | 'warning' | 'failed' | 'attention'

/** Audit entry: action and outcome plus counts or a sanitized error, never secrets or payloads. */
async function recordAuditSql(
  db: Db,
  userId: string,
  action: AuditAction,
  outcome: AuditOutcome,
  detail: Record<string, string | number | boolean> = {},
) {
  await db.insert(integrationAuditEvents).values({
    id: crypto.randomUUID(),
    userId,
    provider: 'bitvavo',
    action,
    outcome,
    detail,
    createdAt: Date.now(),
  })
}

async function listAuditSql(db: Db, userId: string) {
  return db
    .select()
    .from(integrationAuditEvents)
    .where(eq(integrationAuditEvents.userId, userId))
    .orderBy(integrationAuditEvents.createdAt)
}

async function atomic(
  db: Db,
  statements: [
    BatchItem<'sqlite'> & PromiseLike<unknown>,
    ...(BatchItem<'sqlite'> & PromiseLike<unknown>)[],
  ],
) {
  if ('batch' in db && typeof db.batch === 'function') {
    await db.batch(statements)
  } else {
    await runInTransaction(db, async () => {
      for (const statement of statements) await statement
    })
  }
}

async function listInstrumentsSql(db: Db, userId: string) {
  const links = await runWithDb(db, market.listUserInstrumentsByUser(userId))
  return runWithDb(db, market.listInstrumentsByIds(links.map((link) => link.instrumentId)))
}

async function matchingInstrumentsSql(db: Db, userId: string, symbol: string) {
  const instruments = await listInstrumentsSql(db, userId)
  return instruments.filter((instrument) => instrument.normalizedSymbol === symbol)
}

export type OperationOutcome = 'created' | 'updated' | 'unchanged'

/** Fields Bitvavo governs; any difference is a remote correction. */
const REMOTE_FIELDS = [
  'executedAt',
  'timeZone',
  'date',
  'time',
  'side',
  'symbol',
  'quantity',
  'unitPrice',
  'fee',
  'cashAmount',
  'currency',
] as const

/** Only the operation itself is stored, never preview bookkeeping. */
function remoteOperationOf(operation: RemoteOperation): RemoteOperation {
  return {
    provider: 'bitvavo',
    externalId: operation.externalId,
    ...Object.fromEntries(REMOTE_FIELDS.map((key) => [key, operation[key]])),
  } as RemoteOperation
}

function amountMinorOf(operation: RemoteOperation): number {
  const amountMinor =
    new Decimal(operation.cashAmount)
      .times(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber() * (operation.side === 'sell' ? -1 : 1)
  if (!Number.isSafeInteger(amountMinor))
    throw new RejectedCommandError('Importe Bitvavo fuera de rango.')
  return amountMinor
}

function tradeDetailOf(
  userId: string,
  transactionId: string,
  operation: RemoteOperation,
  instrumentId: string | null,
  createdAt: string,
  now: string,
) {
  return {
    userId,
    transactionId,
    instrumentId,
    symbol: operation.symbol,
    side: operation.side,
    quantity: operation.quantity,
    priceMinor: new Decimal(operation.unitPrice).times(100).toDecimalPlaces(0).toNumber(),
    feeMinor: new Decimal(operation.fee).times(100).toDecimalPlaces(0).toNumber(),
    currency: 'EUR',
    createdAt,
    updatedAt: now,
  }
}

async function uniqueInstrumentSql(db: Db, userId: string, symbol: string) {
  const matches = await matchingInstrumentsSql(db, userId, symbol)
  return matches.length === 1 ? matches[0].id : null
}

/**
 * Applies one remote operation by its external identity: creates it (or links
 * the chosen manual movement), updates its financial fields when Bitvavo
 * corrected it, or leaves it unchanged. Declaration, description, category,
 * account and the instrument link stay local.
 */
async function applyOperationSql(
  db: Db,
  userId: string,
  accountId: string,
  input: RemoteOperation,
  transactionId: string | null,
): Promise<OperationOutcome> {
  const operation = remoteOperationOf(input)
  const [imported] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.externalId, operation.externalId)))
  if (imported) return correctOperationSql(db, userId, imported.id, operation)
  await assertOwnedReferences(db, userId, { accountId })
  const existing = transactionId
    ? await runWithDb(db, transactionRepository.get(userId, transactionId))
    : undefined
  if (transactionId && (!existing || existing.remoteOperation))
    throw new RejectedCommandError('El movimiento manual ya no está disponible.')
  const instrumentId = await uniqueInstrumentSql(db, userId, operation.symbol)
  const id = existing?.id ?? `bitvavo:${userId}:${operation.externalId}`
  const amountMinor = amountMinorOf(operation)
  const now = nowIso()
  const detail = tradeDetailOf(userId, id, operation, instrumentId, now, now)
  const values = {
    accountId,
    type: 'investment',
    date: operation.date,
    time: operation.time,
    description:
      existing?.description ??
      `${operation.side === 'buy' ? 'Compra' : 'Venta'} ${operation.quantity} ${operation.symbol}`,
    amountMinor,
    currency: 'EUR',
    externalId: operation.externalId,
    remoteOperation: operation,
    updatedAt: now,
  }
  const updated = {
    ...existing,
    ...values,
    id,
    userId,
    legacyId: existing?.legacyId ?? null,
    categoryId: existing?.categoryId ?? null,
    amount: amountMinor / 100,
    declared: existing?.declared ?? false,
    createdAt: existing?.createdAt ?? now,
    version: (existing?.version ?? 0) + 1,
    tradeDetail: { ...detail, price: Number(operation.unitPrice), fee: Number(operation.fee) },
  }
  await atomic(db, [
    db
      .insert(transactions)
      .values({
        ...values,
        id,
        userId,
        categoryId: existing?.categoryId ?? null,
        declared: existing?.declared ?? false,
        createdAt: existing?.createdAt ?? now,
        version: updated.version,
      })
      .onConflictDoUpdate({
        target: transactions.id,
        set: { ...values, version: sql`${transactions.version} + 1` },
      }),
    db
      .insert(investmentTradeDetails)
      .values(detail)
      .onConflictDoUpdate({ target: investmentTradeDetails.transactionId, set: detail }),
    ...transactionSyncStatements(db, userId, id, updated, now),
  ])
  return 'created'
}

async function correctOperationSql(
  db: Db,
  userId: string,
  transactionId: string,
  operation: RemoteOperation,
): Promise<OperationOutcome> {
  const movement = await runWithDb(db, transactionRepository.get(userId, transactionId))
  if (!movement) throw new RejectedCommandError('Movimiento Bitvavo no encontrado.')
  const previous = movement.remoteOperation
  if (previous && REMOTE_FIELDS.every((key) => previous[key] === operation[key])) return 'unchanged'
  const current = await runWithDb(
    db,
    transactionRepository.getTradeDetailByTransaction(userId, transactionId),
  )
  // The local instrument link survives a correction; an unlinked one may resolve now.
  const instrumentId =
    current?.instrumentId ?? (await uniqueInstrumentSql(db, userId, operation.symbol))
  const amountMinor = amountMinorOf(operation)
  const now = nowIso()
  const detail = tradeDetailOf(
    userId,
    transactionId,
    operation,
    instrumentId,
    current?.createdAt ?? now,
    now,
  )
  const values = {
    date: operation.date,
    time: operation.time,
    amountMinor,
    remoteOperation: operation,
    updatedAt: now,
  }
  await atomic(db, [
    db
      .update(transactions)
      .set({ ...values, version: sql`${transactions.version} + 1` })
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId))),
    db
      .insert(investmentTradeDetails)
      .values(detail)
      .onConflictDoUpdate({ target: investmentTradeDetails.transactionId, set: detail }),
    ...transactionSyncStatements(
      db,
      userId,
      transactionId,
      {
        ...movement,
        ...values,
        amount: amountMinor / 100,
        version: movement.version + 1,
        tradeDetail: { ...detail, price: Number(operation.unitPrice), fee: Number(operation.fee) },
      },
      now,
    ),
  ])
  return 'updated'
}

/** Every movement imported from Bitvavo, with its stored remote operation. */
async function listRemoteMovementsSql(db: Db, userId: string) {
  const rows = await runWithDb(db, transactionRepository.listByUser(userId))
  return rows.flatMap((row) =>
    row.remoteOperation?.provider === 'bitvavo'
      ? [{ id: row.id, remoteOperation: row.remoteOperation }]
      : [],
  )
}

async function linkInstrumentSql(
  db: Db,
  userId: string,
  transactionId: string,
  instrumentId: string,
) {
  const movement = await runWithDb(db, transactionRepository.get(userId, transactionId))
  if (!movement?.remoteOperation)
    throw new RejectedCommandError('Movimiento Bitvavo no encontrado.')
  const links = await runWithDb(db, market.listUserInstrumentsByUser(userId))
  if (!links.some((link) => link.instrumentId === instrumentId))
    throw new RejectedCommandError('Instrumento no disponible para este usuario.')
  const detail = await runWithDb(
    db,
    transactionRepository.getTradeDetailByTransaction(userId, transactionId),
  )
  if (!detail) throw new RejectedCommandError('Operación ausente.')
  const now = nowIso()
  await atomic(db, [
    db
      .update(investmentTradeDetails)
      .set({ instrumentId, updatedAt: now })
      .where(
        and(
          eq(investmentTradeDetails.transactionId, transactionId),
          eq(investmentTradeDetails.userId, userId),
        ),
      ),
    db
      .update(transactions)
      .set({ version: sql`${transactions.version} + 1`, updatedAt: now })
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId))),
    ...transactionSyncStatements(
      db,
      userId,
      transactionId,
      {
        ...movement,
        version: movement.version + 1,
        tradeDetail: { ...detail, instrumentId },
      },
      now,
    ),
  ])
}

function transactionSyncStatements(
  db: Db,
  userId: string,
  transactionId: string,
  payload: Record<string, unknown>,
  now: string,
) {
  return [
    db
      .insert(userRevisions)
      .values({ userId, revision: 1, updatedAt: now })
      .onConflictDoUpdate({
        target: userRevisions.userId,
        set: { revision: sql`${userRevisions.revision} + 1`, updatedAt: now },
      }),
    db.insert(syncChanges).values({
      userId,
      revision: sql`(select revision from user_revisions where user_id = ${userId})`,
      entityType: 'transaction',
      entityId: transactionId,
      changeType: 'upsert',
      payload: JSON.stringify(payload),
      createdAt: now,
    }),
  ]
}

export const getConnection = lift(getConnectionSql)
export const ensureConnection = lift(ensureConnectionSql)
export const saveConnection = lift(saveConnectionSql)
export const acquire = lift(acquireSql)
export const renew = lift(renewSql)
export const release = lift(releaseSql)
export const removeConnection = lift(removeConnectionSql)
export const savePreview = lift(savePreviewSql)
export const getPreview = lift(getPreviewSql)
export const reservePreview = lift(reservePreviewSql)
export const finishRange = lift(finishRangeSql)
export const recordFailure = lift(recordFailureSql)
export const listSkipped = lift(listSkippedSql)
export const disconnect = lift(disconnectSql)
export const recordAudit = lift(recordAuditSql)
export const listAudit = lift(listAuditSql)
export const listRemoteMovements = lift(listRemoteMovementsSql)
export const listInstruments = lift(listInstrumentsSql)
export const matchingInstruments = lift(matchingInstrumentsSql)
export const applyOperation = lift(applyOperationSql)
export const linkInstrument = lift(linkInstrumentSql)
