#!/usr/bin/env -S node
/**
 * WP9 — v2 → v1-shaped JSON rollback exporter.
 *
 * The inverse of `scripts/migrate-v1-to-v2.ts`: reads a user's v2 rows back
 * out through the WP6 repository layer and reconstructs a `State`-shaped
 * JSON object (`src/scripts/types.ts`), suitable for restoring into v1's
 * `app_state.payload` if a migration needs to be rolled back within the
 * WP11 retention window.
 *
 * Fields with no v2 counterpart (category emoji overrides, contribution
 * `warnings`/`flowSource`, Stock Events `sync`/`watchlistId`/`hidden` flags)
 * are reconstructed with safe defaults — `normalizeState()` downstream
 * would fill the same defaults in anyway, so this stays a lossless-enough
 * round trip for every financial figure while being explicit (not silent)
 * about the cosmetic fields it cannot recover.
 */

import { parseArgs } from 'node:util'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  accountsRepository,
  budgetEntriesRepository,
  contributionsRepository,
  goalsRepository,
  integrationCredentialsRepository,
  marketRepository,
  pendingMovementsRepository,
  recurringRulesRepository,
  stockeventsCashMappingsRepository,
  stockeventsSymbolMappingsRepository,
  subscriptionsRepository,
  transactionsRepository,
  userSettingsRepository,
  usersRepository,
  wealthRepository,
} from '../src/db/repositories'
import { openLocalV2Db } from './lib/migration-db'
import type { DataEncryptionEnv } from '../src/lib/server/crypto/data-encryption'
import type {
  BudgetType,
  Contribution,
  GoalKey,
  Instrument,
  PendingMovement,
  Quote,
  RecurringRule,
  SnapshotRow,
  State,
  Subscription,
  Transaction,
} from '../src/scripts/types'

function monthFromISO(date: string): number {
  const match = /^\d{4}-(\d{2})-\d{2}$/.exec(date)
  return match ? Math.min(11, Math.max(0, Number(match[1]) - 1)) : 0
}

async function exportState(
  v2Path: string,
  userId: string,
  year: number | undefined,
): Promise<State> {
  const { db, close } = openLocalV2Db(v2Path)
  try {
    const [
      allAccounts,
      twrLiquidityAccounts,
      categories,
      transactions,
      subscriptions,
      recurringRules,
      pendingMovements,
      budgetEntries,
      goals,
      wealthSnapshots,
      contributions,
      userInstruments,
      stockeventsSymbolMappings,
      stockeventsCashMappings,
      stockeventsCashSyncEntries,
      userSettings,
    ] = await Promise.all([
      accountsRepository.listByUser(db, userId),
      accountsRepository.listTwrLiquidityAccountsByUser(db, userId),
      accountsRepository.listCategoriesByUser(db, userId),
      transactionsRepository.listByUser(db, userId),
      subscriptionsRepository.listByUser(db, userId),
      recurringRulesRepository.listByUser(db, userId),
      pendingMovementsRepository.listByUser(db, userId),
      budgetEntriesRepository.listByUser(db, userId),
      goalsRepository.listByUser(db, userId),
      wealthRepository.listByUser(db, userId),
      contributionsRepository.listByUser(db, userId),
      marketRepository.listUserInstrumentsByUser(db, userId),
      stockeventsSymbolMappingsRepository.listByUser(db, userId),
      stockeventsCashMappingsRepository.listMappingsByUser(db, userId),
      stockeventsCashMappingsRepository.listSyncEntriesByUser(db, userId),
      userSettingsRepository.get(db, userId),
    ])

    const accountLegacyId = (v2Id: string | null): string => {
      if (!v2Id) return ''
      const row = allAccounts.find((a) => a.id === v2Id)
      return row?.legacyId ?? v2Id
    }
    const categoryName = (v2Id: string | null): string => {
      if (!v2Id) return 'Sin categoría'
      return categories.find((c) => c.id === v2Id)?.name ?? 'Sin categoría'
    }
    const categoryKind = (v2Id: string): string | undefined =>
      categories.find((c) => c.id === v2Id)?.kind

    const cashAccounts = allAccounts.filter((a) => a.kind === 'cash')
    const investmentAssets = allAccounts.filter((a) => a.kind === 'investment')
    const liabilities = allAccounts.filter((a) => a.kind === 'liability')

    const incomeCategories = categories
      .filter((c) => c.kind === 'income')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => c.name)
    const expenseCategories = categories
      .filter((c) => c.kind === 'expense')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => c.name)
    const investmentCategories = categories
      .filter((c) => c.kind === 'investment')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => c.name)

    const instrumentIds = userInstruments.map((ui) => ui.instrumentId)
    const instrumentRows = await Promise.all(
      instrumentIds.map((id) => marketRepository.getInstrument(db, id)),
    )
    const instruments: Instrument[] = []
    const quotes: Record<string, Quote> = {}
    for (let i = 0; i < userInstruments.length; i += 1) {
      const ui = userInstruments[i]
      const instrument = instrumentRows[i]
      if (!instrument) continue
      const legacyInstrumentId = instrument.legacyId ?? instrument.id
      instruments.push({
        id: legacyInstrumentId,
        investmentAssetId: ui.alias ?? '',
        type: (instrument.assetClass as Instrument['type']) ?? 'stock',
        symbol: instrument.symbol,
        market: '',
        currency: instrument.currency,
        provider: instrument.provider,
        active: true,
      })
      const quoteRows = await marketRepository.listQuotesByInstrument(db, instrument.id)
      const latest = quoteRows.sort((a, b) => a.quotedAt.localeCompare(b.quotedAt)).at(-1)
      if (latest) {
        quotes[legacyInstrumentId] = {
          instrumentId: legacyInstrumentId,
          price: latest.price,
          currency: latest.currency,
          timestamp: latest.quotedAt,
          source: 'v2-export',
          status: 'fresh',
          isStale: false,
          previousClose: null,
          changePercent: null,
        }
      }
    }

    const v1Transactions: Transaction[] = []
    for (const tx of transactions) {
      const base: Transaction = {
        id: tx.legacyId ?? tx.id,
        date: tx.date,
        month: monthFromISO(tx.date),
        type: tx.type as Transaction['type'],
        accountId: accountLegacyId(tx.accountId),
        category: categoryName(tx.categoryId),
        description: tx.description ?? '',
        amount: tx.amount,
      }
      if (tx.type === 'investment') {
        const detail = await transactionsRepository.getTradeDetailByTransaction(db, userId, tx.id)
        if (detail) {
          const instrument = detail.instrumentId
            ? await marketRepository.getInstrument(db, detail.instrumentId)
            : undefined
          base.side = detail.side as Transaction['side']
          base.unitPrice = detail.price
          base.units = Number(detail.quantity)
          base.fee = detail.fee
          base.movementCurrency = detail.currency
          if (instrument) {
            base.symbol = instrument.symbol
            base.instrumentId = instrument.legacyId ?? instrument.id
          }
        }
      }
      v1Transactions.push(base)
    }

    const v1Subscriptions: Subscription[] = subscriptions.map((s) => ({
      id: s.legacyId ?? s.id,
      name: s.name,
      amount: s.amount,
      accountId: accountLegacyId(s.accountId),
      category: categoryName(s.categoryId),
      frequency: s.frequency as Subscription['frequency'],
      startDate: s.startDate ?? '',
      nextChargeDate: s.nextChargeDate ?? s.startDate ?? '',
      active: s.isActive,
    }))

    const v1RecurringRules: RecurringRule[] = recurringRules.map((r) => ({
      id: r.legacyId ?? r.id,
      type: r.type as RecurringRule['type'],
      accountId: accountLegacyId(r.accountId),
      category: categoryName(r.categoryId),
      description: r.name,
      amount: r.amount,
      frequency: r.frequency as RecurringRule['frequency'],
      interval: r.interval ?? 1,
      startDate: r.startDate ?? r.nextRunDate ?? '',
      endDate: r.endDate ?? null,
      active: r.status === 'active',
      lastExecutionDate: r.lastExecutionDate ?? null,
      nextOccurrenceDate: r.nextRunDate,
      ...(r.symbol ? { symbol: r.symbol } : {}),
      ...(r.side ? { side: r.side as RecurringRule['side'] } : {}),
      ...(r.units !== null && r.units !== undefined ? { units: r.units } : {}),
      ...(r.unitPrice !== null && r.unitPrice !== undefined ? { unitPrice: r.unitPrice } : {}),
      ...(r.fee !== null && r.fee !== undefined ? { fee: r.fee } : {}),
      ...(r.time ? { time: r.time } : {}),
    }))
    const recurringRuleLegacyById = new Map(recurringRules.map((r) => [r.id, r.legacyId ?? r.id]))

    const v1PendingMovements: PendingMovement[] = pendingMovements.map((p) => ({
      id: p.legacyId ?? p.id,
      occurrenceKey: `${recurringRuleLegacyById.get(p.recurringRuleId) ?? p.recurringRuleId}:${p.dueDate}`,
      ruleId: recurringRuleLegacyById.get(p.recurringRuleId) ?? p.recurringRuleId,
      occurrenceDate: p.dueDate,
      type: (p.type || 'expense') as PendingMovement['type'],
      accountId: accountLegacyId(p.accountId),
      category: categoryName(p.categoryId),
      description: p.description ?? '',
      amount: p.amount,
      ...(p.symbol ? { symbol: p.symbol } : {}),
      ...(p.side ? { side: p.side as PendingMovement['side'] } : {}),
      ...(p.units !== null && p.units !== undefined ? { units: p.units } : {}),
      ...(p.unitPrice !== null && p.unitPrice !== undefined ? { unitPrice: p.unitPrice } : {}),
      ...(p.fee !== null && p.fee !== undefined ? { fee: p.fee } : {}),
      ...(p.time ? { time: p.time } : {}),
      status: p.status as PendingMovement['status'],
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      transactionId: p.transactionId ?? null,
    }))

    const budget: State['budget'] = { income: {}, expense: {}, investment: {} }
    for (const entry of budgetEntries) {
      const kind = categoryKind(entry.categoryId) as BudgetType | undefined
      const name = categoryName(entry.categoryId)
      if (!kind) continue
      if (!budget[kind][name]) {
        budget[kind][name] = Array.from({ length: 12 }, () => 0)
      }
      budget[kind][name][entry.month] = entry.amount
    }

    const goalsOut: State['goals'] = {} as State['goals']
    for (const goal of goals) {
      goalsOut[goal.key as GoalKey] = {
        name: goal.name,
        targetYear: goal.targetYear ?? new Date().getFullYear(),
        targetAmount: goal.targetAmount,
      }
    }

    const snapshots: Record<string, SnapshotRow> = {}
    for (const snapshot of wealthSnapshots) {
      const balances = await wealthRepository.listBalancesBySnapshot(db, userId, snapshot.id)
      const row: SnapshotRow = {
        month: snapshot.month,
        accounts: {},
        investments: {},
        liabilities: {},
      }
      for (const balance of balances) {
        if (!balance.accountId) continue
        const account = allAccounts.find((a) => a.id === balance.accountId)
        if (!account) continue
        const legacyId = account.legacyId ?? account.id
        if (account.kind === 'cash') row.accounts[legacyId] = balance.balance
        else if (account.kind === 'investment') row.investments[legacyId] = balance.balance
        else if (account.kind === 'liability') row.liabilities[legacyId] = balance.balance
      }
      snapshots[String(snapshot.month)] = row
    }

    const v1Contributions: Contribution[] = []
    for (const contribution of contributions) {
      const allocations = await contributionsRepository.listAllocationsByContribution(
        db,
        userId,
        contribution.id,
      )
      v1Contributions.push({
        id: contribution.legacyId ?? contribution.id,
        date: contribution.date,
        amount: contribution.amount,
        portfolioDate: contribution.portfolioDate ?? contribution.date,
        portfolioValue: contribution.portfolioValue ?? 0,
        flow: contribution.flow ?? 0,
        flowAllocations: allocations.map((a) => ({
          accountId: accountLegacyId(a.accountId),
          amount: a.amount,
        })),
        flowSource: 'allocations',
        warnings: [],
      })
    }

    let apiKey = ''
    const env: DataEncryptionEnv = {
      DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY,
      DATA_ENCRYPTION_KEY_PREVIOUS: process.env.DATA_ENCRYPTION_KEY_PREVIOUS,
      DATA_ENCRYPTION_KEY_VERSION: process.env.DATA_ENCRYPTION_KEY_VERSION,
    }
    if (env.DATA_ENCRYPTION_KEY) {
      const credential = await integrationCredentialsRepository.getByProvider(
        db,
        userId,
        'stockevents',
        env,
      )
      if (credential) {
        apiKey = credential.secret
      }
    }

    const primaryCurrency = cashAccounts[0]?.currency ?? 'EUR'
    const resolvedYear =
      year ?? wealthSnapshots[0]?.year ?? budgetEntries[0]?.year ?? new Date().getFullYear()

    const state: State = {
      meta: {
        source: 'v2-export',
        generatedAt: new Date().toISOString(),
        version: 1,
        savedAt: null,
      },
      onboardingPresented: userSettings?.onboardingPresented === 1,
      onboardingDismissed: userSettings?.onboardingDismissed === 1,
      onboardingAccountCompleted: userSettings?.onboardingAccountCompleted === 1,
      onboardingMovementCompleted: userSettings?.onboardingMovementCompleted === 1,
      onboardingCompleted: userSettings?.onboardingCompleted === 1,
      year: resolvedYear,
      currency: primaryCurrency,
      twrLiquidityAccountIds: twrLiquidityAccounts.map((t) => t.legacyId ?? t.accountId),
      accounts: cashAccounts.map((a) => ({
        id: a.legacyId ?? a.id,
        name: a.name,
        openingBalance: a.openingBalance,
      })),
      investmentAssets: investmentAssets.map((a) => ({
        id: a.legacyId ?? a.id,
        name: a.name,
        openingBalance: a.openingBalance,
      })),
      liabilities: liabilities.map((a) => ({
        id: a.legacyId ?? a.id,
        name: a.name,
        openingBalance: a.openingBalance,
      })),
      incomeCategories,
      expenseCategories,
      investmentCategories,
      categoryEmojis: {},
      transactions: v1Transactions,
      subscriptions: v1Subscriptions,
      snapshots,
      budget,
      goals: goalsOut,
      contributions: v1Contributions,
      instruments,
      quotes,
      recurringRules: v1RecurringRules,
      pendingMovements: v1PendingMovements,
      stockEvents: {
        enabled: (userSettings?.stockeventsEnabled ?? 0) === 1,
        apiKey,
        symbolMappings: stockeventsSymbolMappings.map((m) => ({
          symbol: m.legacyId ?? m.stockeventsSymbol,
          sync: m.sync === 1,
          watchlistId: m.watchlistId ?? '',
          targetSymbol: m.stockeventsSymbol,
          hidden: m.hidden === 1,
        })),
        cashMappings: stockeventsCashMappings.map((m) => ({
          accountId: m.accountId ? accountLegacyId(m.accountId) : '',
          watchlistId: m.watchlistId,
        })),
        cashSyncEntries: stockeventsCashSyncEntries.map((e) => ({
          contributionDate: e.contributionDate,
          accountId: e.accountId ? accountLegacyId(e.accountId) : '',
          watchlistId: e.watchlistId,
          syncedAmount: e.syncedAmount,
        })),
      },
    }

    return state
  } finally {
    close()
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'v2-sqlite': { type: 'string', default: '.data/finance-tracker-v2.sqlite' },
      email: { type: 'string' },
      'user-id': { type: 'string' },
      year: { type: 'string' },
      out: { type: 'string' },
    },
  })

  const v2Path = resolve(values['v2-sqlite'] ?? '.data/finance-tracker-v2.sqlite')
  let userId = values['user-id']
  if (!userId) {
    const email =
      values.email ?? process.env.LEGACY_OWNER_EMAIL ?? 'legacy-owner@finance-tracker.local'
    const { db, close } = openLocalV2Db(v2Path)
    const user = await usersRepository.getByEmail(db, email)
    close()
    if (!user) {
      throw new Error(`No user found for email '${email}'. Pass --user-id or --email explicitly.`)
    }
    userId = user.id
  }

  const year = values.year ? Number(values.year) : undefined
  const state = await exportState(v2Path, userId, year)
  const output = JSON.stringify(state, null, 2)
  if (values.out) {
    writeFileSync(resolve(values.out), output, 'utf8')
    console.log(`Exported v1-shaped state to ${values.out}`)
  } else {
    console.log(output)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
