import { and, eq, lt, or, isNull, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import Decimal from 'decimal.js'
import {
  bitvavoConnections,
  bitvavoPreviews,
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
import { runWithDb } from '../database'
import type { BitvavoPreview, RemoteOperation } from '../../lib/bitvavo-types'

export async function getConnection(db: Db, userId: string) {
  const [row] = await db
    .select()
    .from(bitvavoConnections)
    .where(eq(bitvavoConnections.userId, userId))
  return row
}
export async function ensureConnection(
  db: Db,
  userId: string,
  input: { accountId: string; startDate: string; timeZone: string },
) {
  await db
    .insert(bitvavoConnections)
    .values({ userId, ...input })
    .onConflictDoNothing()
}
export async function saveConnection(
  db: Db,
  userId: string,
  input: { accountId: string; startDate: string; timeZone: string },
  envelope: EncryptedEnvelope,
  token: string,
) {
  const existing = await getConnection(db, userId)
  if (existing?.lockToken !== token)
    throw new RejectedCommandError('La reserva de Bitvavo ha caducado.')
  await assertOwnedReferences(db, userId, { accountId: input.accountId })
  const now = nowIso()
  await atomic(db, [
    db
      .insert(bitvavoConnections)
      .values({ userId, ...input })
      .onConflictDoUpdate({
        target: bitvavoConnections.userId,
        set: { ...input, cursor: null, version: sql`${bitvavoConnections.version} + 1` },
      }),
    db
      .insert(integrationCredentials)
      .values({ userId, provider: 'bitvavo', ...envelope, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [integrationCredentials.userId, integrationCredentials.provider],
        set: { ...envelope, updatedAt: now, version: sql`${integrationCredentials.version} + 1` },
      }),
  ])
}
export async function acquire(db: Db, userId: string, token: string) {
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
  if (!rows.length) throw new RejectedCommandError('Ya hay una importación Bitvavo en curso.')
}
export async function renew(db: Db, userId: string, token: string) {
  const rows = await db
    .update(bitvavoConnections)
    .set({ lockUntil: Date.now() + 600000 })
    .where(and(eq(bitvavoConnections.userId, userId), eq(bitvavoConnections.lockToken, token)))
    .returning()
  if (!rows.length)
    throw new RejectedCommandError('La reserva de Bitvavo ha caducado. Reintenta la importación.')
}
export async function release(db: Db, userId: string, token: string) {
  await db
    .update(bitvavoConnections)
    .set({ lockToken: null, lockUntil: 0 })
    .where(and(eq(bitvavoConnections.userId, userId), eq(bitvavoConnections.lockToken, token)))
}
export async function savePreview(db: Db, userId: string, preview: BitvavoPreview) {
  await db
    .insert(bitvavoPreviews)
    .values({ id: preview.id, userId, preview, createdAt: Date.now() })
}
export async function getPreview(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(bitvavoPreviews)
    .where(and(eq(bitvavoPreviews.userId, userId), eq(bitvavoPreviews.id, id)))
  return row
}
export async function reservePreview(db: Db, userId: string, id: string, resolutions: string) {
  await db
    .update(bitvavoPreviews)
    .set({ status: 'processing', resolutions })
    .where(and(eq(bitvavoPreviews.userId, userId), eq(bitvavoPreviews.id, id)))
}
export async function finishPreview(
  db: Db,
  userId: string,
  preview: BitvavoPreview,
  token: string,
) {
  await atomic(db, [
    db
      .update(bitvavoConnections)
      .set({ cursor: sql`max(coalesce(${bitvavoConnections.cursor}, 0), ${preview.to})` })
      .where(and(eq(bitvavoConnections.userId, userId), eq(bitvavoConnections.lockToken, token))),
    db
      .update(bitvavoPreviews)
      .set({ status: 'complete' })
      .where(and(eq(bitvavoPreviews.userId, userId), eq(bitvavoPreviews.id, preview.id))),
  ])
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

export async function listInstruments(db: Db, userId: string) {
  const links = await runWithDb(db, market.listUserInstrumentsByUser(userId))
  return runWithDb(db, market.listInstrumentsByIds(links.map((link) => link.instrumentId)))
}

export async function matchingInstruments(db: Db, userId: string, symbol: string) {
  const instruments = await listInstruments(db, userId)
  return instruments.filter((instrument) => instrument.normalizedSymbol === symbol)
}

export async function importOperation(
  db: Db,
  userId: string,
  accountId: string,
  operation: RemoteOperation,
  transactionId: string | null,
) {
  await assertOwnedReferences(db, userId, { accountId })
  const [imported] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.externalId, operation.externalId)))
  if (imported) return false
  const existing = transactionId
    ? await runWithDb(db, transactionRepository.get(userId, transactionId))
    : undefined
  if (transactionId && (!existing || existing.remoteOperation))
    throw new RejectedCommandError('El movimiento manual ya no está disponible.')
  const matches = await matchingInstruments(db, userId, operation.symbol)
  const instrumentId = matches.length === 1 ? matches[0].id : null
  const id = existing?.id ?? `bitvavo:${userId}:${operation.externalId}`
  const amountMinor =
    new Decimal(operation.cashAmount)
      .times(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber() * (operation.side === 'sell' ? -1 : 1)
  if (!Number.isSafeInteger(amountMinor))
    throw new RejectedCommandError('Importe Bitvavo fuera de rango.')
  const now = nowIso()
  const detail = {
    userId,
    transactionId: id,
    instrumentId,
    symbol: operation.symbol,
    side: operation.side,
    quantity: operation.quantity,
    priceMinor: new Decimal(operation.unitPrice).times(100).toDecimalPlaces(0).toNumber(),
    feeMinor: new Decimal(operation.fee).times(100).toDecimalPlaces(0).toNumber(),
    currency: 'EUR',
    createdAt: now,
    updatedAt: now,
  }
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
  return true
}

export async function linkInstrument(
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
