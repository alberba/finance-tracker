/**
 * Fusión de las cuentas-ETF heredadas en instrumentos de una cuenta de inversión (#564, spec #557).
 *
 * Las cuentas «ETF XDWH», «ETF IQQI»… no son sitios donde haya dinero: son instrumentos que se
 * tienen en Trade Republic (ADR 0011). Mismo patrón que la reparación de vínculos
 * (`instrument-link-repair.ts`): el plan es un dato que solo lee, y la ejecución aplica
 * exactamente ese plan en una transacción, publica cada cambio en `sync_changes` y comprueba
 * que el patrimonio de cada mes y el capital aportado no cambian; si cambian, aborta entera.
 *
 * Por cada cuenta heredada, el plan:
 * - Suma su saldo en cada cierre mensual a la cuenta destino (con lo que valía ese mes: su saldo
 *   arrastrado más sus movimientos) y su saldo inicial.
 * - Pasa su instrumento (el que apunta a ella por `alias`) a la cuenta destino.
 * - Reasigna sus movimientos: cuenta destino + instrumento (ADR 0011).
 * - Pasa sus aportes a la cuenta destino.
 * - La archiva, sin borrarla.
 *
 * La correspondencia cuenta heredada → cuenta de inversión es una entrada del plan, no algo fijo.
 */

import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import {
  accounts,
  categories,
  contributionAllocations,
  contributions,
  investmentTradeDetails,
  marketInstruments,
  snapshotBalances,
  syncChanges,
  transactions,
  userInstruments,
  wealthSnapshots,
} from '../../src/db/schema'
import { runWithDb } from '../../src/db/database'
import * as accountsRepository from '../../src/db/repositories/accounts'
import * as contributionsRepository from '../../src/db/repositories/contributions'
import * as marketRepository from '../../src/db/repositories/market'
import * as syncRepository from '../../src/db/repositories/sync'
import * as transactionsRepository from '../../src/db/repositories/transactions'
import * as wealthRepository from '../../src/db/repositories/wealth'
import { nowIso, runInTransaction, type Db } from '../../src/db/repositories/shared'
import { buildBootstrapPayload } from '../../src/lib/server/bootstrap-payload'
import { projectSyncV2State, type SyncV2Bootstrap } from '../../src/lib/client/v2-state-projection'
import { computeInvestmentValue, getWealthByMonth } from '../../src/lib/finance-core'
import { toMinorUnits } from '../../src/lib/money'
import type { Month } from '../../src/lib/month'
import type { State } from '../../src/scripts/types'

/** Una cuenta heredada y la cuenta de inversión (broker) en la que pasa a ser instrumento. */
export interface AccountMerge {
  accountName: string
  brokerName: string
}

export interface AccountMergeOptions {
  merges: readonly AccountMerge[]
}

export interface MergedInstrument {
  /** Instrumento de mercado: es el que llevan las operaciones de sus movimientos. */
  id: string
  symbol: string
  /** Su alta en el usuario, donde vive la cuenta (`alias`). */
  userInstrumentId: string
}

export interface BrokerPlan {
  name: string
  /** `null` mientras no exista: el plan la crea. */
  id: string | null
  create: boolean
  currency: string
  openingBalanceMinor: { from: number; to: number }
}

export interface MergedAccountPlan {
  id: string
  name: string
  brokerName: string
  openingBalanceMinor: number
  instruments: MergedInstrument[]
}

/** Lo que valía cada cuenta heredada en un cierre, y el saldo que deja en el broker. */
export interface ClosePlan {
  snapshotId: string
  date: string
  brokerName: string
  brokerBalanceMinor: { from: number | null; to: number }
  merged: { accountName: string; balanceMinor: number }[]
}

export interface AllocationPlan {
  contributionId: string
  date: string
  brokerName: string
  merged: { accountName: string; amountMinor: number }[]
  brokerAmountMinor: { from: number | null; to: number }
}

export interface MovementPlan {
  transactionId: string
  date: string
  description: string | null
  amountMinor: number
  accountName: string
  brokerName: string
  instrument?: { from: null; to: { id: string; symbol: string } }
}

export interface AccountMergePlan {
  brokers: BrokerPlan[]
  accounts: MergedAccountPlan[]
  closes: ClosePlan[]
  allocations: AllocationPlan[]
  movements: MovementPlan[]
  /** Cuentas heredadas que ya se fusionaron (archivadas): no se vuelven a tocar. */
  alreadyMerged: string[]
  /** Motivos por los que el plan no se puede ejecutar. */
  blockers: string[]
}

export interface AccountMergeReport {
  accountsArchived: number
  instrumentsMoved: number
  closesMerged: number
  allocationsMerged: number
  movementsReassigned: number
}

/** Lo que la fusión no puede cambiar. */
export interface MergeInvariants {
  /** Patrimonio de cada mes («año-mes»), en unidades menores, tal como lo calcula el cliente. */
  netWorthMinor: Record<string, number>
  /** Capital aportado: aportes, su reparto por cuenta y el importe de las inversiones. */
  contributedMinor: { contributions: number; allocations: number; investments: number }
}

type AccountRow = typeof accounts.$inferSelect

const norm = (value: string | null | undefined): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()

function sameName(left: string, right: string): boolean {
  return norm(left) === norm(right)
}

interface Resolved {
  broker: AccountRow | null
  brokerName: string
  legacy: AccountRow[]
}

/** Casa cada cuenta heredada y cada broker con sus filas; falla si el nombre no es inequívoco. */
function resolveMerges(rows: readonly AccountRow[], merges: readonly AccountMerge[]) {
  const brokers = new Map<string, Resolved>()
  const alreadyMerged: string[] = []
  const blockers: string[] = []

  for (const merge of merges) {
    if (sameName(merge.accountName, merge.brokerName)) {
      throw new Error(`La cuenta '${merge.accountName}' no puede fusionarse en sí misma.`)
    }
    const matches = rows.filter(
      (row) => sameName(row.name, merge.accountName) && row.kind === 'investment',
    )
    const active = matches.filter((row) => !row.isArchived)
    if (active.length > 1) {
      throw new Error(
        `Hay ${active.length} cuentas de inversión activas llamadas '${merge.accountName}'; no se sabe cuál fusionar.`,
      )
    }
    if (active.length === 0) {
      if (matches.length === 0) {
        throw new Error(`No hay ninguna cuenta de inversión llamada '${merge.accountName}'.`)
      }
      alreadyMerged.push(matches[0].name)
      continue
    }

    const key = norm(merge.brokerName)
    let target = brokers.get(key)
    if (!target) {
      const candidates = rows.filter(
        (row) => sameName(row.name, merge.brokerName) && row.kind === 'investment' && !row.isArchived,
      )
      if (candidates.length > 1) {
        throw new Error(
          `Hay ${candidates.length} cuentas de inversión activas llamadas '${merge.brokerName}'; no se sabe en cuál fusionar.`,
        )
      }
      target = { broker: candidates[0] ?? null, brokerName: merge.brokerName.trim(), legacy: [] }
      brokers.set(key, target)
    }
    if (active[0].currency !== (target.broker?.currency ?? target.legacy[0]?.currency ?? active[0].currency)) {
      blockers.push(
        `La cuenta '${active[0].name}' está en ${active[0].currency}, distinta de la de '${target.brokerName}'.`,
      )
    }
    target.legacy.push(active[0])
  }
  return { brokers: [...brokers.values()], alreadyMerged, blockers }
}

async function loadYearState(db: Db, userId: string, year: number): Promise<State> {
  const bootstrap = await runWithDb(db, buildBootstrapPayload(userId, year))
  return projectSyncV2State(bootstrap as unknown as SyncV2Bootstrap, year)
}

async function snapshotYears(db: Db, userId: string): Promise<number[]> {
  const rows = await db
    .select({ year: wealthSnapshots.year })
    .from(wealthSnapshots)
    .where(eq(wealthSnapshots.userId, userId))
  return [...new Set(rows.map((row) => row.year))].sort((a, b) => a - b)
}

/**
 * Calcula el plan sin escribir nada. Una segunda ejecución sobre datos ya fusionados devuelve
 * un plan sin cuentas, que es lo que hace idempotente la fusión.
 */
export async function buildAccountMergePlan(
  db: Db,
  userId: string,
  options: AccountMergeOptions,
): Promise<AccountMergePlan> {
  const accountRows = await db.select().from(accounts).where(eq(accounts.userId, userId))
  const resolved = resolveMerges(accountRows, options.merges)
  const plan: AccountMergePlan = {
    brokers: [],
    accounts: [],
    closes: [],
    allocations: [],
    movements: [],
    alreadyMerged: resolved.alreadyMerged,
    blockers: resolved.blockers,
  }
  const groups = resolved.brokers.filter((group) => group.legacy.length > 0)
  if (groups.length === 0) return plan

  const brokerOf = new Map<string, Resolved>()
  const legacyById = new Map<string, AccountRow>()
  for (const group of groups) {
    for (const legacy of group.legacy) {
      brokerOf.set(legacy.id, group)
      legacyById.set(legacy.id, legacy)
    }
  }

  // -- instrumentos: los que apuntan a cada cuenta heredada por `alias` --------------------
  const trackedRows = await db
    .select({
      userInstrumentId: userInstruments.id,
      instrumentId: userInstruments.instrumentId,
      alias: userInstruments.alias,
      symbol: marketInstruments.symbol,
    })
    .from(userInstruments)
    .innerJoin(marketInstruments, eq(marketInstruments.id, userInstruments.instrumentId))
    .where(eq(userInstruments.userId, userId))
  const legacyOfAlias = (alias: string | null): AccountRow | undefined =>
    alias
      ? ([...legacyById.values()].find((row) => row.id === alias || row.legacyId === alias) ?? undefined)
      : undefined
  const instrumentsOf = new Map<string, MergedInstrument[]>()
  for (const row of trackedRows) {
    const legacy = legacyOfAlias(row.alias)
    if (!legacy) continue
    instrumentsOf.set(legacy.id, [
      ...(instrumentsOf.get(legacy.id) ?? []),
      { id: row.instrumentId, symbol: row.symbol, userInstrumentId: row.userInstrumentId },
    ])
  }

  for (const group of groups) {
    plan.brokers.push({
      name: group.brokerName,
      id: group.broker?.id ?? null,
      create: group.broker === null,
      currency: (group.broker ?? group.legacy[0]).currency,
      openingBalanceMinor: {
        from: group.broker?.openingBalanceMinor ?? 0,
        to:
          (group.broker?.openingBalanceMinor ?? 0) +
          group.legacy.reduce((sum, legacy) => sum + legacy.openingBalanceMinor, 0),
      },
    })
  }
  for (const merge of options.merges) {
    const legacy = [...legacyById.values()].find((row) => sameName(row.name, merge.accountName))
    if (!legacy) continue
    const instruments = instrumentsOf.get(legacy.id) ?? []
    if (instruments.length === 0) {
      plan.blockers.push(
        `La cuenta '${legacy.name}' no tiene ningún instrumento; añade su símbolo en Ajustes antes de fusionarla.`,
      )
    }
    plan.accounts.push({
      id: legacy.id,
      name: legacy.name,
      brokerName: brokerOf.get(legacy.id)!.brokerName,
      openingBalanceMinor: legacy.openingBalanceMinor,
      instruments,
    })
  }

  // -- cierres: lo que valía cada cuenta heredada, mes a mes --------------------------------
  const snapshotRows = await db
    .select()
    .from(wealthSnapshots)
    .where(eq(wealthSnapshots.userId, userId))
    .orderBy(asc(wealthSnapshots.snapshotDate), asc(wealthSnapshots.id))
  const balanceRows = snapshotRows.length
    ? await db.select().from(snapshotBalances).where(eq(snapshotBalances.userId, userId))
    : []
  const brokerIds = new Set(groups.flatMap((group) => (group.broker ? [group.broker.id] : [])))
  const touchedYears = new Set<number>()
  for (const snapshot of snapshotRows) {
    const touched = balanceRows.some(
      (row) =>
        row.snapshotId === snapshot.id &&
        row.accountId &&
        (legacyById.has(row.accountId) || brokerIds.has(row.accountId)),
    )
    if (touched) touchedYears.add(snapshot.year)
  }
  for (const year of await snapshotYears(db, userId)) {
    if (!touchedYears.has(year)) continue
    const state = await loadYearState(db, userId, year)
    const valueOf = (accountName: string, month: number): number => {
      const asset = state.investmentAssets.find((item) => item.name === accountName)
      if (!asset) return 0
      return computeInvestmentValue(
        asset.id,
        month as Month,
        state.investmentAssets,
        state.transactions,
        state.snapshots,
        state.instruments,
      )
    }
    for (const snapshot of snapshotRows.filter((row) => row.year === year)) {
      for (const group of groups) {
        const currency = (group.broker ?? group.legacy[0]).currency
        const merged = group.legacy.map((legacy) => ({
          accountName: legacy.name,
          balanceMinor: toMinorUnits(valueOf(legacy.name, snapshot.month), currency),
        }))
        const own = group.broker ? toMinorUnits(valueOf(group.broker.name, snapshot.month), currency) : 0
        const existing = group.broker
          ? balanceRows.find(
              (row) => row.snapshotId === snapshot.id && row.accountId === group.broker!.id,
            )
          : undefined
        plan.closes.push({
          snapshotId: snapshot.id,
          date: snapshot.snapshotDate,
          brokerName: group.brokerName,
          brokerBalanceMinor: {
            from: existing?.balanceMinor ?? null,
            to: own + merged.reduce((sum, item) => sum + item.balanceMinor, 0),
          },
          merged,
        })
      }
    }
  }

  // -- aportes: su reparto por cuenta -------------------------------------------------------
  const contributionRows = await db
    .select()
    .from(contributions)
    .where(eq(contributions.userId, userId))
    .orderBy(asc(contributions.date), asc(contributions.id))
  const allocationRows = contributionRows.length
    ? await db.select().from(contributionAllocations).where(eq(contributionAllocations.userId, userId))
    : []
  for (const contribution of contributionRows) {
    const own = allocationRows.filter((row) => row.contributionId === contribution.id)
    for (const group of groups) {
      const merged = group.legacy.flatMap((legacy) => {
        const amounts = own.filter((row) => row.accountId === legacy.id)
        return amounts.length
          ? [{ accountName: legacy.name, amountMinor: amounts.reduce((sum, row) => sum + row.amountMinor, 0) }]
          : []
      })
      if (merged.length === 0) continue
      const existing = group.broker ? own.filter((row) => row.accountId === group.broker!.id) : []
      const from = existing.length ? existing.reduce((sum, row) => sum + row.amountMinor, 0) : null
      plan.allocations.push({
        contributionId: contribution.id,
        date: contribution.date,
        brokerName: group.brokerName,
        merged,
        brokerAmountMinor: {
          from,
          to: (from ?? 0) + merged.reduce((sum, item) => sum + item.amountMinor, 0),
        },
      })
    }
  }

  // -- movimientos: cuenta destino + instrumento --------------------------------------------
  const categoryRows = await db.select().from(categories).where(eq(categories.userId, userId))
  const categoryById = new Map(categoryRows.map((row) => [row.id, row]))
  const movementRows = await db
    .select({
      transactionId: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amountMinor: transactions.amountMinor,
      categoryId: transactions.categoryId,
      destinationAccountId: transactions.destinationAccountId,
      instrumentId: investmentTradeDetails.instrumentId,
      symbol: investmentTradeDetails.symbol,
      hasDetail: investmentTradeDetails.id,
    })
    .from(transactions)
    .leftJoin(investmentTradeDetails, eq(investmentTradeDetails.transactionId, transactions.id))
    .where(and(eq(transactions.userId, userId), eq(transactions.type, 'investment')))
    .orderBy(asc(transactions.date), asc(transactions.id))
  const accountById = new Map(accountRows.map((row) => [row.id, row]))
  for (const movement of movementRows) {
    const legacy = ownerOfMovement(movement, accountById, legacyById, trackedRows, categoryById)
    if (!legacy) continue
    const instruments = instrumentsOf.get(legacy.id) ?? []
    const entry: MovementPlan = {
      transactionId: movement.transactionId,
      date: movement.date,
      description: movement.description,
      amountMinor: movement.amountMinor,
      accountName: legacy.name,
      brokerName: brokerOf.get(legacy.id)!.brokerName,
    }
    if (movement.hasDetail && movement.instrumentId === null) {
      const symbol = String(movement.symbol ?? '').trim().toUpperCase()
      const target =
        instruments.length === 1
          ? instruments[0]
          : instruments.find((item) => item.symbol.toUpperCase() === symbol)
      if (target) entry.instrument = { from: null, to: { id: target.id, symbol: target.symbol } }
    }
    plan.movements.push(entry)
  }
  return plan
}

/**
 * La cuenta heredada a la que pertenece un movimiento de inversión, con la misma regla que el
 * cliente (`movementBelongsToInvestmentAsset`): cuenta destino explícita, luego la cuenta de su
 * instrumento y por último la categoría (legacy).
 */
function ownerOfMovement(
  movement: {
    categoryId: string | null
    destinationAccountId: string | null
    instrumentId: string | null
  },
  accountById: ReadonlyMap<string, AccountRow>,
  legacyById: ReadonlyMap<string, AccountRow>,
  tracked: readonly { instrumentId: string; alias: string | null }[],
  categoryById: ReadonlyMap<string, { name: string; legacyId: string | null }>,
): AccountRow | null {
  const destination = movement.destinationAccountId
    ? accountById.get(movement.destinationAccountId)
    : undefined
  if (destination?.kind === 'investment') return legacyById.get(destination.id) ?? null

  const instrument = movement.instrumentId
    ? tracked.find((row) => row.instrumentId === movement.instrumentId)
    : undefined
  if (instrument) {
    return (
      [...legacyById.values()].find(
        (row) => instrument.alias === row.id || (row.legacyId && instrument.alias === row.legacyId),
      ) ?? null
    )
  }

  const category = movement.categoryId ? categoryById.get(movement.categoryId) : undefined
  if (!category) return null
  return (
    [...legacyById.values()].find(
      (row) => sameName(row.name, category.name) || (row.legacyId && row.legacyId === category.legacyId),
    ) ?? null
  )
}

const money = (minor: number) => (minor / 100).toFixed(2)

/** El plan como texto para revisarlo antes de ejecutar. */
export function formatAccountMergePlan(plan: AccountMergePlan): string {
  const lines: string[] = []
  for (const broker of plan.brokers) {
    lines.push(
      `${broker.create ? 'Se crea la cuenta de inversión' : 'Cuenta de inversión'} «${broker.name}» ` +
        `(saldo inicial ${money(broker.openingBalanceMinor.from)} → ${money(broker.openingBalanceMinor.to)})`,
    )
  }
  lines.push(`Cuentas a fusionar y archivar: ${plan.accounts.length}`)
  for (const account of plan.accounts) {
    const instruments = account.instruments.map((item) => item.symbol).join(', ') || 'sin instrumento'
    lines.push(`  ${account.name} → ${account.brokerName} · instrumentos: ${instruments}`)
  }
  lines.push(`Cierres mensuales afectados: ${plan.closes.length}`)
  for (const close of plan.closes) {
    const detail = close.merged.map((item) => `${item.accountName} ${money(item.balanceMinor)}`).join(' + ')
    lines.push(
      `  ${close.date} · ${close.brokerName}: ${close.brokerBalanceMinor.from === null ? 'sin saldo' : money(close.brokerBalanceMinor.from)} → ${money(close.brokerBalanceMinor.to)} (${detail})`,
    )
  }
  lines.push(`Aportes afectados: ${plan.allocations.length}`)
  for (const allocation of plan.allocations) {
    const detail = allocation.merged.map((item) => `${item.accountName} ${money(item.amountMinor)}`).join(' + ')
    lines.push(
      `  ${allocation.date} · ${allocation.brokerName}: ${money(allocation.brokerAmountMinor.to)} (${detail})`,
    )
  }
  lines.push(`Movimientos a reasignar: ${plan.movements.length}`)
  for (const movement of plan.movements) {
    const instrument = movement.instrument ? ` · instrumento ${movement.instrument.to.symbol}` : ''
    lines.push(
      `  ${movement.transactionId} · ${movement.date} · ${movement.accountName} → ${movement.brokerName}${instrument}`,
    )
  }
  if (plan.alreadyMerged.length) lines.push(`Ya fusionadas: ${plan.alreadyMerged.join(', ')}`)
  for (const blocker of plan.blockers) lines.push(`BLOQUEO: ${blocker}`)
  return lines.join('\n')
}

// -- invariantes ------------------------------------------------------------------------------

/** Lo que no puede cambiar con la fusión, medido tal como lo ve el cliente. */
export async function measureMergeInvariants(db: Db, userId: string): Promise<MergeInvariants> {
  const years = new Set(await snapshotYears(db, userId))
  const movementYears = await db
    .select({ date: transactions.date })
    .from(transactions)
    .where(eq(transactions.userId, userId))
  for (const row of movementYears) years.add(Number(row.date.slice(0, 4)))

  const netWorthMinor: Record<string, number> = {}
  for (const year of [...years].sort((a, b) => a - b)) {
    const state = await loadYearState(db, userId, year)
    for (let month = 1; month <= 12; month++) {
      const { net } = getWealthByMonth(
        month as Month,
        state.accounts,
        state.investmentAssets,
        state.liabilities,
        state.transactions,
        state.snapshots,
        state.instruments,
      )
      netWorthMinor[`${year}-${String(month).padStart(2, '0')}`] = toMinorUnits(net, state.currency)
    }
  }

  const [contributed] = await db
    .select({ total: sql<number>`COALESCE(SUM(${contributions.amountMinor}), 0)` })
    .from(contributions)
    .where(eq(contributions.userId, userId))
  const [allocated] = await db
    .select({ total: sql<number>`COALESCE(SUM(${contributionAllocations.amountMinor}), 0)` })
    .from(contributionAllocations)
    .where(eq(contributionAllocations.userId, userId))
  const [invested] = await db
    .select({ total: sql<number>`COALESCE(SUM(${transactions.amountMinor}), 0)` })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.type, 'investment')))
  return {
    netWorthMinor,
    contributedMinor: {
      contributions: Number(contributed.total),
      allocations: Number(allocated.total),
      investments: Number(invested.total),
    },
  }
}

/** Compara el antes y el después; el mensaje lista cada diferencia. */
export function describeInvariantDifferences(before: MergeInvariants, after: MergeInvariants): string[] {
  const differences: string[] = []
  const months = new Set([...Object.keys(before.netWorthMinor), ...Object.keys(after.netWorthMinor)])
  for (const month of [...months].sort()) {
    if (before.netWorthMinor[month] !== after.netWorthMinor[month]) {
      differences.push(
        `Patrimonio de ${month}: ${money(before.netWorthMinor[month] ?? 0)} → ${money(after.netWorthMinor[month] ?? 0)}`,
      )
    }
  }
  for (const key of ['contributions', 'allocations', 'investments'] as const) {
    if (before.contributedMinor[key] !== after.contributedMinor[key]) {
      differences.push(
        `Capital aportado (${key}): ${money(before.contributedMinor[key])} → ${money(after.contributedMinor[key])}`,
      )
    }
  }
  return differences
}

// -- ejecución --------------------------------------------------------------------------------

/**
 * Aplica el plan en una transacción. Recalcula el plan dentro de ella: si no coincide con el
 * que se revisó, aborta sin escribir nada. Tras escribir, comprueba que el patrimonio de cada mes
 * y el capital aportado son idénticos a antes y, si no, revierte todo. Cada fila tocada sube su
 * versión y entra en `sync_changes`, de modo que los demás dispositivos la reciben.
 */
export async function applyAccountMergePlan(
  db: Db,
  userId: string,
  plan: AccountMergePlan,
  options: AccountMergeOptions,
): Promise<AccountMergeReport> {
  if (plan.blockers.length > 0) {
    throw new Error(`El plan no se puede ejecutar:\n${plan.blockers.map((item) => `  - ${item}`).join('\n')}`)
  }
  const report: AccountMergeReport = {
    accountsArchived: 0,
    instrumentsMoved: 0,
    closesMerged: 0,
    allocationsMerged: 0,
    movementsReassigned: 0,
  }
  if (plan.accounts.length === 0) return report

  return runInTransaction(db, async () => {
    const fresh = await buildAccountMergePlan(db, userId, options)
    if (JSON.stringify(fresh) !== JSON.stringify(plan)) {
      throw new Error('Los datos cambiaron desde que se calculó el plan; vuelve a simularlo.')
    }
    const before = await measureMergeInvariants(db, userId)
    const now = nowIso()
    const touched = {
      accounts: new Set<string>(),
      userInstruments: new Set<string>(),
      snapshots: new Set<string>(),
      contributions: new Set<string>(),
      transactions: new Set<string>(),
    }

    // Cuentas de inversión destino: se crean o suman el saldo inicial de las que reciben.
    const brokerIds = new Map<string, string>()
    for (const broker of plan.brokers) {
      if (broker.create) {
        const [row] = await db
          .insert(accounts)
          .values({
            userId,
            name: broker.name,
            kind: 'investment',
            currency: broker.currency,
            openingBalanceMinor: broker.openingBalanceMinor.to,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: accounts.id })
        brokerIds.set(broker.name, row.id)
        touched.accounts.add(row.id)
      } else {
        await db
          .update(accounts)
          .set({
            openingBalanceMinor: broker.openingBalanceMinor.to,
            version: sql`${accounts.version} + 1`,
            updatedAt: now,
          })
          .where(and(eq(accounts.userId, userId), eq(accounts.id, broker.id!)))
        brokerIds.set(broker.name, broker.id!)
        touched.accounts.add(broker.id!)
      }
    }
    const brokerId = (name: string) => brokerIds.get(name)!
    const legacyIds = plan.accounts.map((account) => account.id)

    // Instrumentos: pasan a la cuenta destino.
    for (const account of plan.accounts) {
      for (const instrument of account.instruments) {
        await db
          .update(userInstruments)
          .set({
            alias: brokerId(account.brokerName),
            version: sql`${userInstruments.version} + 1`,
            updatedAt: now,
          })
          .where(and(eq(userInstruments.userId, userId), eq(userInstruments.id, instrument.userInstrumentId)))
        touched.userInstruments.add(instrument.userInstrumentId)
        report.instrumentsMoved++
      }
    }

    // Cierres: el saldo de las cuentas heredadas se suma en la cuenta destino.
    for (const close of plan.closes) {
      const target = brokerId(close.brokerName)
      await db
        .delete(snapshotBalances)
        .where(
          and(
            eq(snapshotBalances.userId, userId),
            eq(snapshotBalances.snapshotId, close.snapshotId),
            inArray(snapshotBalances.accountId, legacyIds),
          ),
        )
      const [existing] = await db
        .select({ id: snapshotBalances.id })
        .from(snapshotBalances)
        .where(and(eq(snapshotBalances.snapshotId, close.snapshotId), eq(snapshotBalances.accountId, target)))
      if (existing) {
        await db
          .update(snapshotBalances)
          .set({ balanceMinor: close.brokerBalanceMinor.to })
          .where(eq(snapshotBalances.id, existing.id))
      } else {
        const broker = plan.brokers.find((item) => item.name === close.brokerName)!
        await db.insert(snapshotBalances).values({
          userId,
          snapshotId: close.snapshotId,
          accountId: target,
          balanceMinor: close.brokerBalanceMinor.to,
          currency: broker.currency,
          createdAt: now,
        })
      }
      await db
        .update(wealthSnapshots)
        .set({ version: sql`${wealthSnapshots.version} + 1`, updatedAt: now })
        .where(and(eq(wealthSnapshots.userId, userId), eq(wealthSnapshots.id, close.snapshotId)))
      touched.snapshots.add(close.snapshotId)
      report.closesMerged++
    }

    // Aportes: su reparto por cuenta pasa a la cuenta destino.
    for (const allocation of plan.allocations) {
      const target = brokerId(allocation.brokerName)
      await db
        .delete(contributionAllocations)
        .where(
          and(
            eq(contributionAllocations.userId, userId),
            eq(contributionAllocations.contributionId, allocation.contributionId),
            inArray(contributionAllocations.accountId, legacyIds),
          ),
        )
      const [existing] = await db
        .select({ id: contributionAllocations.id })
        .from(contributionAllocations)
        .where(
          and(
            eq(contributionAllocations.contributionId, allocation.contributionId),
            eq(contributionAllocations.accountId, target),
          ),
        )
      if (existing) {
        await db
          .update(contributionAllocations)
          .set({ amountMinor: allocation.brokerAmountMinor.to })
          .where(eq(contributionAllocations.id, existing.id))
      } else {
        const [contribution] = await db
          .select({ currency: contributions.currency })
          .from(contributions)
          .where(eq(contributions.id, allocation.contributionId))
        await db.insert(contributionAllocations).values({
          userId,
          contributionId: allocation.contributionId,
          accountId: target,
          amountMinor: allocation.brokerAmountMinor.to,
          currency: contribution.currency,
          createdAt: now,
        })
      }
      await db
        .update(contributions)
        .set({ version: sql`${contributions.version} + 1`, updatedAt: now })
        .where(and(eq(contributions.userId, userId), eq(contributions.id, allocation.contributionId)))
      touched.contributions.add(allocation.contributionId)
      report.allocationsMerged++
    }

    // Movimientos: cuenta destino + instrumento.
    for (const movement of plan.movements) {
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
      }
      await db
        .update(transactions)
        .set({
          destinationAccountId: brokerId(movement.brokerName),
          version: sql`${transactions.version} + 1`,
          updatedAt: now,
        })
        .where(and(eq(transactions.userId, userId), eq(transactions.id, movement.transactionId)))
      touched.transactions.add(movement.transactionId)
      report.movementsReassigned++
    }

    // Las cuentas originales se archivan, no se borran; su saldo inicial ya está en la destino.
    for (const account of plan.accounts) {
      await db
        .update(accounts)
        .set({
          isArchived: 1,
          openingBalanceMinor: 0,
          version: sql`${accounts.version} + 1`,
          updatedAt: now,
        })
        .where(and(eq(accounts.userId, userId), eq(accounts.id, account.id)))
      touched.accounts.add(account.id)
      report.accountsArchived++
    }

    const differences = describeInvariantDifferences(before, await measureMergeInvariants(db, userId))
    if (differences.length > 0) {
      throw new Error(
        `La fusión cambiaría el patrimonio o el capital aportado; no se ha escrito nada:\n${differences.map((item) => `  - ${item}`).join('\n')}`,
      )
    }

    await publishChanges(db, userId, touched, now)
    return report
  })
}

async function publishChanges(
  db: Db,
  userId: string,
  touched: {
    accounts: ReadonlySet<string>
    userInstruments: ReadonlySet<string>
    snapshots: ReadonlySet<string>
    contributions: ReadonlySet<string>
    transactions: ReadonlySet<string>
  },
  now: string,
): Promise<void> {
  const publish = async (entityType: string, entityId: string, payload: unknown) => {
    const { revision } = await runWithDb(db, syncRepository.bumpRevision(userId))
    await db.insert(syncChanges).values({
      userId,
      revision,
      entityType,
      entityId,
      changeType: 'upsert',
      payload: JSON.stringify(payload),
      createdAt: now,
    })
  }
  for (const id of touched.accounts) {
    await publish('account', id, await runWithDb(db, accountsRepository.get(userId, id)))
  }
  for (const id of touched.userInstruments) {
    await publish('userInstrument', id, await runWithDb(db, marketRepository.getUserInstrument(userId, id)))
  }
  for (const id of touched.snapshots) {
    const snapshot = await runWithDb(db, wealthRepository.get(userId, id))
    const balances = await runWithDb(db, wealthRepository.listBalancesBySnapshot(userId, id))
    await publish('wealthSnapshot', id, { ...snapshot, balances })
  }
  for (const id of touched.contributions) {
    const contribution = await runWithDb(db, contributionsRepository.get(userId, id))
    const allocations = await runWithDb(db, contributionsRepository.listAllocationsByContribution(userId, id))
    await publish('contribution', id, { ...contribution, allocations })
  }
  for (const id of touched.transactions) {
    const transaction = await runWithDb(db, transactionsRepository.get(userId, id))
    const tradeDetail = await runWithDb(db, transactionsRepository.getTradeDetailByTransaction(userId, id))
    await publish('transaction', id, { ...transaction, tradeDetail })
  }
}
