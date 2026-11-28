/**
 * Reparación de vínculos de inversión (#558, spec #557).
 *
 * Mismo patrón que la reparación de datos corruptos (`repair-plan.ts`): el plan
 * es un dato que solo lee, y la ejecución aplica exactamente ese plan en una
 * transacción. Corrige tres defectos de los movimientos de inversión:
 *
 * 1. Sin instrumento: llevan el símbolo pero no el instrumento (desde agosto).
 * 2. Instrumento equivocado: el símbolo descrito no es el del instrumento
 *    vinculado (tres compras de ETH apuntaban al instrumento de BTC).
 * 3. Cuenta equivocada: las compras de un símbolo se hacen en una cuenta
 *    concreta (ETH en Bitvavo) y algunas constan con otra.
 *
 * La correspondencia símbolo → cuenta es una entrada del plan, no algo fijo.
 */

import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import {
  accounts,
  investmentTradeDetails,
  marketInstruments,
  transactions,
  userInstruments,
} from '../../src/db/schema'
import { runWithDb } from '../../src/db/database'
import * as transactionsRepository from '../../src/db/repositories/transactions'
import { chunkIds, nowIso, runInTransaction, type Db } from '../../src/db/repositories/shared'
import { normalizeSymbol } from '../../src/domain/investment/symbol-matching'
import { publishSyncChange, resolveActiveAccountByName } from './repair-shared'

/** Compras de un símbolo que deben constar en la cuenta con ese nombre. */
export interface AccountMove {
  symbol: string
  accountName: string
}

export interface InstrumentLinkRepairOptions {
  accountMoves: readonly AccountMove[]
}

export interface InstrumentRef {
  id: string
  symbol: string
}

export interface AccountRef {
  id: string
  name: string
}

/** Un movimiento que el plan modifica, con el antes y el después de cada cambio. */
export interface MovementRepair {
  transactionId: string
  date: string
  description: string | null
  symbol: string
  instrument?: { from: InstrumentRef | null; to: InstrumentRef }
  account?: { from: AccountRef; to: AccountRef }
}

export type SkipReason = 'sin-instrumento' | 'varios-instrumentos'

/** Un movimiento con símbolo que no se puede vincular y se deja como está. */
export interface SkippedMovement {
  transactionId: string
  date: string
  symbol: string
  reason: SkipReason
}

export interface InstrumentLinkRepairPlan {
  movements: MovementRepair[]
  skipped: SkippedMovement[]
}

export interface InstrumentLinkRepairReport {
  instrumentsLinked: number
  accountsMoved: number
}

async function investmentMovements(db: Db, userId: string) {
  return db
    .select({
      transactionId: transactions.id,
      date: transactions.date,
      description: transactions.description,
      accountId: transactions.accountId,
      instrumentId: investmentTradeDetails.instrumentId,
      symbol: investmentTradeDetails.symbol,
    })
    .from(transactions)
    .innerJoin(investmentTradeDetails, eq(investmentTradeDetails.transactionId, transactions.id))
    .where(and(eq(transactions.userId, userId), eq(transactions.type, 'investment')))
    .orderBy(asc(transactions.date), asc(transactions.id))
}

async function instrumentsById(
  db: Db,
  ids: readonly string[],
): Promise<Map<string, InstrumentRef>> {
  const found = new Map<string, InstrumentRef>()
  for (const chunk of chunkIds([...new Set(ids)])) {
    const rows = await db
      .select({ id: marketInstruments.id, symbol: marketInstruments.symbol })
      .from(marketInstruments)
      .where(inArray(marketInstruments.id, chunk))
    for (const row of rows) found.set(row.id, row)
  }
  return found
}

/** Instrumentos que el usuario tiene vinculados, por símbolo normalizado. */
async function userInstrumentsBySymbol(
  db: Db,
  userId: string,
): Promise<Map<string, (InstrumentRef & { normalizedSymbol: string })[]>> {
  const rows = await db
    .select({
      id: marketInstruments.id,
      symbol: marketInstruments.symbol,
      normalizedSymbol: marketInstruments.normalizedSymbol,
    })
    .from(userInstruments)
    .innerJoin(marketInstruments, eq(marketInstruments.id, userInstruments.instrumentId))
    .where(eq(userInstruments.userId, userId))
  const bySymbol = new Map<string, typeof rows>()
  for (const row of rows) {
    bySymbol.set(row.normalizedSymbol, [...(bySymbol.get(row.normalizedSymbol) ?? []), row])
  }
  return bySymbol
}

async function resolveMoveTargets(
  db: Db,
  userId: string,
  moves: readonly AccountMove[],
): Promise<Map<string, AccountRef>> {
  const rows = await db
    .select({ id: accounts.id, name: accounts.name, isArchived: accounts.isArchived })
    .from(accounts)
    .where(eq(accounts.userId, userId))
  const targets = new Map<string, AccountRef>()
  for (const move of moves) {
    const target = resolveActiveAccountByName(rows, move.accountName, {
      none: `No hay ninguna cuenta activa llamada '${move.accountName}' para las compras de ${move.symbol}.`,
      several: (count) =>
        `Hay ${count} cuentas activas llamadas '${move.accountName}'; no se sabe a cuál pasar las compras de ${move.symbol}.`,
    })!
    targets.set(normalizeSymbol(move.symbol), { id: target.id, name: target.name })
  }
  return targets
}

/**
 * Calcula el plan sin escribir nada. Una segunda ejecución sobre datos ya
 * reparados devuelve un plan vacío, que es lo que hace idempotente la reparación.
 */
export async function buildInstrumentLinkRepairPlan(
  db: Db,
  userId: string,
  options: InstrumentLinkRepairOptions,
): Promise<InstrumentLinkRepairPlan> {
  const [movements, candidates, targets, accountRows] = await Promise.all([
    investmentMovements(db, userId),
    userInstrumentsBySymbol(db, userId),
    resolveMoveTargets(db, userId, options.accountMoves),
    db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.userId, userId)),
  ])
  const linked = await instrumentsById(
    db,
    movements.flatMap((movement) => (movement.instrumentId ? [movement.instrumentId] : [])),
  )
  const accountNames = new Map(accountRows.map((row) => [row.id, row.name]))

  const plan: InstrumentLinkRepairPlan = { movements: [], skipped: [] }
  for (const movement of movements) {
    const symbol = normalizeSymbol(movement.symbol)
    if (!symbol) continue

    const repair: MovementRepair = {
      transactionId: movement.transactionId,
      date: movement.date,
      description: movement.description,
      symbol,
    }
    const current = movement.instrumentId ? (linked.get(movement.instrumentId) ?? null) : null
    const currentMatches = current !== null && normalizeSymbol(current.symbol) === symbol
    if (!currentMatches) {
      const matches = candidates.get(symbol) ?? []
      if (matches.length === 1) {
        repair.instrument = {
          from:
            current ?? (movement.instrumentId ? { id: movement.instrumentId, symbol: '' } : null),
          to: { id: matches[0].id, symbol: matches[0].symbol },
        }
      } else {
        plan.skipped.push({
          transactionId: movement.transactionId,
          date: movement.date,
          symbol,
          reason: matches.length === 0 ? 'sin-instrumento' : 'varios-instrumentos',
        })
        continue
      }
    }

    const target = targets.get(symbol)
    if (target && movement.accountId !== target.id) {
      repair.account = {
        from: { id: movement.accountId, name: accountNames.get(movement.accountId) ?? '' },
        to: target,
      }
    }
    if (repair.instrument || repair.account) plan.movements.push(repair)
  }
  return plan
}

const SKIP_LABEL: Record<SkipReason, string> = {
  'sin-instrumento': 'el usuario no tiene ningún instrumento con ese símbolo',
  'varios-instrumentos': 'el usuario tiene varios instrumentos con ese símbolo',
}

/** El plan como texto para revisarlo antes de ejecutar. */
export function formatInstrumentLinkRepairPlan(plan: InstrumentLinkRepairPlan): string {
  const label = (ref: InstrumentRef | null) =>
    ref ? `${ref.symbol || '?'} (${ref.id})` : 'sin instrumento'
  const lines = [`Movimientos a reparar: ${plan.movements.length}`]
  for (const movement of plan.movements) {
    lines.push(`  ${movement.transactionId} · ${movement.date} · ${movement.symbol}`)
    if (movement.instrument) {
      lines.push(
        `    instrumento: ${label(movement.instrument.from)} → ${label(movement.instrument.to)}`,
      )
    }
    if (movement.account) {
      lines.push(
        `    cuenta: ${movement.account.from.name || movement.account.from.id} → ${movement.account.to.name}`,
      )
    }
  }
  lines.push(`Saltados: ${plan.skipped.length}`)
  for (const skipped of plan.skipped) {
    lines.push(
      `  ${skipped.transactionId} · ${skipped.date} · ${skipped.symbol} · ${SKIP_LABEL[skipped.reason]}`,
    )
  }
  return lines.join('\n')
}

/**
 * Aplica el plan en una transacción. Cada movimiento se comprueba contra el
 * «antes» del plan: si cambió entretanto, la ejecución aborta entera y no se
 * escribe nada. Cada movimiento reparado sube su versión y entra en
 * `sync_changes`, de modo que los demás dispositivos lo reciben.
 */
export async function applyInstrumentLinkRepairPlan(
  db: Db,
  userId: string,
  plan: InstrumentLinkRepairPlan,
): Promise<InstrumentLinkRepairReport> {
  if (plan.movements.length === 0) return { instrumentsLinked: 0, accountsMoved: 0 }

  return runInTransaction(db, async () => {
    let instrumentsLinked = 0
    let accountsMoved = 0

    for (const movement of plan.movements) {
      const [row] = await db
        .select({
          accountId: transactions.accountId,
          instrumentId: investmentTradeDetails.instrumentId,
        })
        .from(transactions)
        .innerJoin(
          investmentTradeDetails,
          eq(investmentTradeDetails.transactionId, transactions.id),
        )
        .where(and(eq(transactions.userId, userId), eq(transactions.id, movement.transactionId)))
      const stale =
        !row ||
        (movement.instrument && (movement.instrument.from?.id ?? null) !== row.instrumentId) ||
        (movement.account && movement.account.from.id !== row.accountId)
      if (stale) {
        throw new Error(
          `El movimiento ${movement.transactionId} cambió desde que se calculó el plan; vuelve a simularlo.`,
        )
      }

      const now = nowIso()
      if (movement.instrument) {
        await db
          .update(investmentTradeDetails)
          .set({ instrumentId: movement.instrument.to.id, updatedAt: now })
          .where(
            and(
              eq(investmentTradeDetails.userId, userId),
              eq(investmentTradeDetails.transactionId, movement.transactionId),
            ),
          )
        instrumentsLinked++
      }
      await db
        .update(transactions)
        .set({
          ...(movement.account ? { accountId: movement.account.to.id } : {}),
          version: sql`${transactions.version} + 1`,
          updatedAt: now,
        })
        .where(and(eq(transactions.userId, userId), eq(transactions.id, movement.transactionId)))
      if (movement.account) accountsMoved++

      const updated = await runWithDb(
        db,
        transactionsRepository.get(userId, movement.transactionId),
      )
      const tradeDetail = await runWithDb(
        db,
        transactionsRepository.getTradeDetailByTransaction(userId, movement.transactionId),
      )
      await publishSyncChange(
        db,
        userId,
        {
          entityType: 'transaction',
          entityId: movement.transactionId,
          payload: { ...updated, tradeDetail },
        },
        now,
      )
    }

    return { instrumentsLinked, accountsMoved }
  })
}
